import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingBlock } from "@/components/loading-block";
import { ShareTargetPage } from "@/components/share-target-page";

export const metadata: Metadata = {
  title: "Save shared item"
};

export default function ShareTargetRoute() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ShareTargetPage />
    </Suspense>
  );
}
