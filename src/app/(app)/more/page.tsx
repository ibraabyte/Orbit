import type { Metadata } from "next";
import { MorePage } from "@/components/more-page";

export const metadata: Metadata = {
  title: "More"
};

// This route renders a hook-less static client component; opt out of static
// prerender to avoid a Next 15/React 19 RSC-bundler client-manifest bug.
// Every app route is auth-gated and served no-store, so static rendering adds nothing.
export const dynamic = "force-dynamic";

export default function MoreRoute() {
  return <MorePage />;
}
