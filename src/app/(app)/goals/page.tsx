import type { Metadata } from "next";
import { GoalsPage } from "@/components/goals-page";

export const metadata: Metadata = {
  title: "Goals"
};

export default function GoalsRoute() {
  return <GoalsPage />;
}
