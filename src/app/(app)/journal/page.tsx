import type { Metadata } from "next";
import { JournalPage } from "@/components/journal-page";

export const metadata: Metadata = {
  title: "Journal"
};

export default function JournalRoute() {
  return <JournalPage />;
}
