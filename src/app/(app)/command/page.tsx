import type { Metadata } from "next";
import { CommandPage } from "@/components/command-page";

export const metadata: Metadata = {
  title: "Command"
};

export default function CommandRoute() {
  return <CommandPage />;
}
