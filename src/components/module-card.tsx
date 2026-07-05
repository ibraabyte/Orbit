import { Card } from "@/components/ui/card";
import { EmptyState as DriftEmptyState } from "@/components/ui/empty-state";

export function ModuleCard({
  title,
  kicker,
  action,
  className,
  children
}: {
  title: string;
  kicker?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card title={title} kicker={kicker} action={action} className={className}>
      {children}
    </Card>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <DriftEmptyState>{children}</DriftEmptyState>;
}
