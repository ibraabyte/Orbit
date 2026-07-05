/** @type {import('next').NextConfig} */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" }
];

const pwaFreshnessHeaders = [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }];
const privateRouteCacheHeaders = [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }];
const privateHtmlRoutes = [
  "/",
  "/sign-in",
  "/sign-up",
  "/dashboard",
  "/plan",
  "/review",
  "/inbox",
  "/focus",
  "/command",
  "/search",
  "/insights",
  "/tasks",
  "/calendar",
  "/health",
  "/food",
  "/finance",
  "/people",
  "/habits",
  "/goals",
  "/journal",
  "/library",
  "/settings",
  "/more",
  "/momentum",
  "/share-target"
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    dirs: ["src"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      },
      ...privateHtmlRoutes.map((source) => ({
        source,
        headers: privateRouteCacheHeaders
      })),
      {
        source: "/api/:path*",
        headers: privateRouteCacheHeaders
      },
      {
        source: "/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/" }, ...pwaFreshnessHeaders]
      },
      {
        source: "/manifest.webmanifest",
        headers: pwaFreshnessHeaders
      }
    ];
  }
};

export default nextConfig;
