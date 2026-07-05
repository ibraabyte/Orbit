import type { Metadata } from "next";
import { HealthPage } from "@/components/health-page";

export const metadata: Metadata = {
  title: "Health"
};

export default function HealthRoute() {
  return <HealthPage />;
}
