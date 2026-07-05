import type { Metadata } from "next";
import { MomentumPage } from "@/components/momentum-page";

export const metadata: Metadata = {
  title: "Momentum"
};

export default function MomentumRoute() {
  return <MomentumPage />;
}
