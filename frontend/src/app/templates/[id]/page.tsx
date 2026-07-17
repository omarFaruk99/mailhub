"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBrand } from "@/lib/use-brand";
import { TemplateEditor } from "@/components/template-editor";
import { PageHeader } from "@/components/app-shell";

export default function EditTemplatePage() {
  const params = useParams();
  const id = String(params.id);
  const { brand } = useBrand();
  const brandId = brand?.id;

  const templates = useQuery({ queryKey: ["templates", brandId], queryFn: () => api.templates(brandId!), enabled: !!brandId });
  const template = templates.data?.find((t) => t.id === id);

  if (!brandId || templates.isLoading) return <PageHeader title="Loading…" />;
  if (!template) return <PageHeader title="Template not found" subtitle="It may have been deleted." />;
  return <TemplateEditor template={template} />;
}
