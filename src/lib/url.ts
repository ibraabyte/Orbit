export type SourcePlatform = {
  source: string;
  label: string;
  aliases: string[];
  social: boolean;
  hosts: string[];
};

export const sourcePlatforms: SourcePlatform[] = [
  { source: "tiktok.com", label: "TikTok", aliases: ["tiktok"], social: true, hosts: ["tiktok.com"] },
  { source: "x.com", label: "X / Twitter", aliases: ["x", "twitter", "tweet"], social: true, hosts: ["x.com", "twitter.com"] },
  { source: "instagram.com", label: "Instagram", aliases: ["instagram", "reel"], social: true, hosts: ["instagram.com"] },
  { source: "threads.net", label: "Threads", aliases: ["threads"], social: true, hosts: ["threads.net"] },
  { source: "youtube.com", label: "YouTube", aliases: ["youtube", "yt", "video"], social: true, hosts: ["youtube.com", "youtu.be"] },
  { source: "reddit.com", label: "Reddit", aliases: ["reddit"], social: true, hosts: ["reddit.com"] },
  { source: "facebook.com", label: "Facebook", aliases: ["facebook"], social: true, hosts: ["facebook.com", "fb.com"] },
  { source: "linkedin.com", label: "LinkedIn", aliases: ["linkedin"], social: true, hosts: ["linkedin.com"] },
  { source: "pinterest.com", label: "Pinterest", aliases: ["pinterest", "pin"], social: true, hosts: ["pinterest.com"] },
  { source: "snapchat.com", label: "Snapchat", aliases: ["snapchat", "snap"], social: true, hosts: ["snapchat.com"] },
  { source: "twitch.tv", label: "Twitch", aliases: ["twitch", "stream"], social: true, hosts: ["twitch.tv"] },
  { source: "discord.com", label: "Discord", aliases: ["discord"], social: true, hosts: ["discord.com", "discord.gg"] },
  { source: "substack.com", label: "Substack", aliases: ["substack", "newsletter"], social: false, hosts: ["substack.com"] }
];

export function sourceFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    return normalizeSourceHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

export function normalizeSourceHost(source: string | null | undefined) {
  if (!source) return null;
  const host = source
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "");
  if (!host) return null;

  return sourcePlatformFromHost(host)?.source ?? host;
}

export function sourcePlatformFromHost(source: string | null | undefined) {
  const host = source
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "");
  if (!host) return null;

  return sourcePlatforms.find((platform) => platform.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) ?? null;
}

export function sourceLabel(source: string | null | undefined) {
  const platform = sourcePlatformFromHost(source);
  return platform?.label ?? normalizeSourceHost(source);
}

export function sourceAliases(source: string | null | undefined) {
  return sourcePlatformFromHost(source)?.aliases ?? [];
}
