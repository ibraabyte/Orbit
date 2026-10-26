import type { Href } from "expo-router";

// src/lib still links with the old web paths; point the merged ones at their new homes.
const moved: Record<string, string> = {
  "/dashboard": "/",
  "/calendar": "/plan",
  "/review": "/plan",
  "/insights": "/plan",
  "/inbox": "/library",
  "/momentum": "/focus",
  "/command": "/",
  "/search": "/"
};

export function appHref(webHref: string) {
  const path = webHref.split(/[?#]/)[0];
  return (moved[path] ?? path) as Href;
}
