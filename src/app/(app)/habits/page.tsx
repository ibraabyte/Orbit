import type { Metadata } from "next";
import { HabitsPage } from "@/components/habits-page";

export const metadata: Metadata = {
  title: "Habits"
};

export default function HabitsRoute() {
  return <HabitsPage />;
}
