import type { Metadata } from "next";
import { DashboardHome } from "@/components/dashboard-home";

export const metadata: Metadata = {
  title: "Today"
};

export default function DashboardPage() {
  return <DashboardHome />;
}
