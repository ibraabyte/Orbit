import type { Metadata } from "next";
import { TasksPage } from "@/components/tasks-page";

export const metadata: Metadata = {
  title: "Tasks"
};

export default function TasksRoute() {
  return <TasksPage />;
}
