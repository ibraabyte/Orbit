"""What a shared link is: its title, picture, site and a guess at its category, for the saver.

TikTok, X and YouTube answer a public oEmbed endpoint (no key), which is how their own embeds get a title and thumbnail.
Any other link is fetched once and its <meta property="og:..."> tags are read. Nothing is downloaded beyond the page's
HTML (the video itself never is), and a page that can't be read still saves: the link alone is enough.

Fetching a URL the user typed is a way into the server's own network, so a page is only fetched from a public address:
http(s), ports 80/443, no user:password, and every address the name resolves to must be public, checked again on each
redirect. ponytail: the address is checked and then httpx resolves the name again, so a DNS answer that flips between
the two (rebinding) gets past the check; closing that means connecting to the checked IP with the host as SNI.
"""

import contextlib
import ipaddress
import re
import socket
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx2 as httpx

USER_AGENT = "Mozilla/5.0 (compatible; OrbitBot/0.4; +https://github.com/ibraabyte/Orbit)"
MAX_HTML_BYTES = 768 * 1024
MAX_REDIRECTS = 4
TIMEOUT = 6.0
DEADLINE = 12.0

# Replaced in tests: httpx2.MockTransport for the network, and a fake resolver for DNS.
transport: httpx.BaseTransport | None = None


def resolve(host: str) -> list[str]:
    return [info[4][0] for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]


@dataclass
class Preview:
    title: str
    site_name: str | None = None
    image_url: str | None = None
    description: str | None = None
    author: str | None = None
    category: str = "other"


class Blocked(Exception):
    """The URL points somewhere the server must not fetch."""


SITE_NAMES = {
    "tiktok.com": "TikTok",
    "x.com": "X",
    "twitter.com": "X",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "instagram.com": "Instagram",
    "snapchat.com": "Snapchat",
    "threads.net": "Threads",
    "reddit.com": "Reddit",
    "linkedin.com": "LinkedIn",
    "facebook.com": "Facebook",
    "goodreads.com": "Goodreads",
    "imdb.com": "IMDb",
    "letterboxd.com": "Letterboxd",
    "themoviedb.org": "TMDB",
    "netflix.com": "Netflix",
    "maps.google.com": "Google Maps",
    "maps.app.goo.gl": "Google Maps",
    "maps.apple.com": "Apple Maps",
    "medium.com": "Medium",
    "substack.com": "Substack",
    "amazon.com": "Amazon",
    "amazon.sa": "Amazon",
}

VIDEO_SITES = ("tiktok.com", "youtube.com", "youtu.be", "vimeo.com", "snapchat.com", "twitch.tv")
POST_SITES = ("x.com", "twitter.com", "threads.net", "bsky.app", "reddit.com", "linkedin.com", "facebook.com", "mastodon.social")
BOOK_SITES = ("goodreads.com", "books.google.com", "openlibrary.org", "jarir.com", "abjjad.com")
MOVIE_SITES = ("imdb.com", "letterboxd.com", "themoviedb.org", "netflix.com", "shahid.mbc.net", "rottentomatoes.com")
PLACE_SITES = ("maps.google.com", "maps.app.goo.gl", "goo.gl", "maps.apple.com", "foursquare.com", "tripadvisor.com", "wego.com")
ARTICLE_SITES = ("medium.com", "substack.com", "wikipedia.org")

OEMBED = {
    "tiktok.com": "https://www.tiktok.com/oembed",
    "youtube.com": "https://www.youtube.com/oembed",
    "youtu.be": "https://www.youtube.com/oembed",
    "x.com": "https://publish.twitter.com/oembed",
    "twitter.com": "https://publish.twitter.com/oembed",
}


def _host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def _matches(host: str, sites: tuple[str, ...] | dict[str, Any]) -> str | None:
    """The listed site this host is, or is a subdomain of (vm.tiktok.com is tiktok.com)."""
    for site in sites:
        if host == site or host.endswith("." + site):
            return site
    return None


def site_name(host: str) -> str:
    known = _matches(host, SITE_NAMES)
    return SITE_NAMES[known] if known else host


def guess_category(url: str, og_type: str | None = None) -> str:
    host = _host(url)
    path = urlsplit(url).path.lower()
    kind = (og_type or "").lower()
    google_maps = _matches(host, ("google.com",)) and path.startswith("/maps")
    if google_maps or _matches(host, PLACE_SITES) or kind in ("place", "restaurant.restaurant", "business.business"):
        return "place"
    if _matches(host, MOVIE_SITES) or kind.startswith(("video.movie", "video.tv_show", "video.episode")):
        return "movie"
    if _matches(host, BOOK_SITES) or kind.startswith("book"):
        return "book"
    if _matches(host, ("instagram.com",)):
        return "video" if "/reel" in path else "post"
    if _matches(host, VIDEO_SITES) or kind.startswith("video"):
        return "video"
    if _matches(host, POST_SITES):
        return "post"
    if _matches(host, ARTICLE_SITES) or kind == "article":
        return "article"
    return "other"


def check_url(url: str) -> str:
    """The URL if it is a plain public web address; raises Blocked otherwise."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise Blocked("That isn't a web link.") from exc
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Blocked("Only http and https links can be read.")
    if parts.username or parts.password:
        raise Blocked("Links with a user name or password aren't read.")
    if port not in (None, 80, 443):
        raise Blocked("Only links on the usual web ports are read.")
    try:
        addresses = [str(ipaddress.ip_address(parts.hostname))]
    except ValueError:
        addresses = None
    try:
        addresses = addresses or resolve(parts.hostname)
    except OSError as exc:
        raise Blocked("That site's name doesn't resolve.") from exc
    if not addresses:
        raise Blocked("That site's name doesn't resolve.")
    for raw in addresses:
        address = ipaddress.ip_address(raw.split("%", 1)[0])
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if not address.is_global or address.is_multicast:
            raise Blocked("That link points inside a private network.")
    return url


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT})


def fetch_page(url: str, deadline: float) -> tuple[str, str]:
    """The final URL and the start of its HTML, following redirects by hand so each hop is checked."""
    with _client() as client:
        for _ in range(MAX_REDIRECTS + 1):
            if time.monotonic() > deadline:
                raise httpx.TimeoutException("Took too long.")
            check_url(url)
            with client.stream("GET", url, headers={"Accept": "text/html,application/xhtml+xml"}) as response:
                if response.is_redirect and response.headers.get("location"):
                    url = urljoin(url, response.headers["location"])
                    continue
                if response.status_code != 200:
                    raise httpx.HTTPStatusError("Not readable.", request=response.request, response=response)
                if "html" not in response.headers.get("content-type", "text/html").lower():
                    return url, ""
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) >= MAX_HTML_BYTES or time.monotonic() > deadline:
                        break
                head = bytes(body[:MAX_HTML_BYTES])
                try:
                    return url, head.decode(response.encoding or "utf-8", errors="replace")
                except LookupError:
                    return url, head.decode("utf-8", errors="replace")
    raise httpx.TooManyRedirects("Too many redirects.")


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta":
            values = {key.lower(): value or "" for key, value in attrs}
            key = (values.get("property") or values.get("name") or "").lower()
            if key and values.get("content") and key not in self.meta:
                self.meta[key] = values["content"]
        elif tag == "title" and not self.title:
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


class _TweetParser(HTMLParser):
    """The text of the first <p> in X's embed HTML, which is the tweet itself."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text = ""
        self._depth = 0
        self._done = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "p" and not self._done:
            self._depth += 1
        elif tag == "br" and self._depth:
            self.text += "\n"

    def handle_endtag(self, tag: str) -> None:
        if tag == "p" and self._depth:
            self._depth -= 1
            self._done = not self._depth

    def handle_data(self, data: str) -> None:
        if self._depth:
            self.text += data


def _clean(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"[ \t\r\f\v]+", " ", value).strip()
    text = re.sub(r"\n\s*\n+", "\n", text)
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _web_url(value: Any, base: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    url = urljoin(base, value.strip())
    return url if urlsplit(url).scheme in ("http", "https") and len(url) <= 2000 else None


def _oembed(url: str, provider: str) -> dict[str, Any] | None:
    params = {"url": url, "format": "json"}
    if provider == "https://publish.twitter.com/oembed":
        # X's endpoint knows twitter.com links best; the tweet is the same.
        params = {"url": re.sub(r"^https?://(?:www\.|mobile\.)?x\.com/", "https://twitter.com/", url), "omit_script": "1", "dnt": "1"}
    try:
        with _client() as client:
            response = client.get(provider, params=params, headers={"Accept": "application/json"})
        if response.status_code != 200:
            return None
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _from_oembed(url: str, data: dict[str, Any]) -> Preview:
    host = _host(url)
    title = _clean(data.get("title"), 280)
    if _matches(host, ("x.com", "twitter.com")) and isinstance(data.get("html"), str):
        parser = _TweetParser()
        parser.feed(data["html"])
        title = _clean(parser.text, 280) or title
    return Preview(
        title=title or "",
        site_name=site_name(host),
        image_url=_web_url(data.get("thumbnail_url"), url),
        author=_clean(data.get("author_name"), 120),
        category=guess_category(url),
    )


def _from_page(url: str, html: str) -> Preview:
    parser = _MetaParser()
    # A broken page still gives whatever was read before it broke.
    with contextlib.suppress(Exception):
        parser.feed(html)
    meta = parser.meta
    host = _host(url)
    return Preview(
        title=_clean(meta.get("og:title") or meta.get("twitter:title") or parser.title, 280) or "",
        site_name=_clean(meta.get("og:site_name"), 120) or site_name(host),
        image_url=_web_url(meta.get("og:image") or meta.get("og:image:url") or meta.get("twitter:image"), url),
        description=_clean(meta.get("og:description") or meta.get("twitter:description") or meta.get("description"), 1000),
        author=_clean(meta.get("author") or meta.get("article:author"), 120),
        category=guess_category(url, meta.get("og:type")),
    )


def _fallback_title(url: str) -> str:
    parts = urlsplit(url)
    return (_host(url) + (parts.path if parts.path not in ("", "/") else ""))[:280] or url[:280]


def _try_oembed(url: str) -> Preview | None:
    provider = OEMBED.get(_matches(_host(url), OEMBED) or "")
    data = _oembed(url, provider) if provider else None
    return _from_oembed(url, data) if data else None


def preview(url: str, shared_title: str | None = None) -> Preview:
    """Never raises: a page that can't (or mustn't) be read gives the link's own address as its title."""
    deadline = time.monotonic() + DEADLINE
    try:
        check_url(url)
    except Blocked:
        found = None
    else:
        found = _try_oembed(url)
        if found is None or not found.title:
            try:
                final_url, html = fetch_page(url, deadline)
            except (httpx.HTTPError, Blocked):
                final_url, html = url, ""
            # A short link (vm.tiktok.com/...) lands on the real page, which the oEmbed endpoint knows.
            if found is None and final_url != url and time.monotonic() < deadline:
                found = _try_oembed(final_url)
            if html:
                page = _from_page(final_url, html)
                found = page if found is None else _merge(found, page)
    if found is None:
        found = Preview(title="", site_name=site_name(_host(url)), category=guess_category(url))
    found.title = found.title or _clean(shared_title, 280) or _fallback_title(url)
    return found


def _merge(first: Preview, extra: Preview) -> Preview:
    return Preview(
        title=first.title or extra.title,
        site_name=first.site_name or extra.site_name,
        image_url=first.image_url or extra.image_url,
        description=first.description or extra.description,
        author=first.author or extra.author,
        category=first.category if first.category != "other" else extra.category,
    )
