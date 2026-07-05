import { PageHeader as DriftPageHeader } from "@/components/ui/page-header";

export function PageHeader({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <DriftPageHeader title={title} subtitle={subtitle}>
      {children}
    </DriftPageHeader>
  );
}
