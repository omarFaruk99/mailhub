"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// For now the app uses a single (first) brand. Multi-brand switcher comes later.
export function useBrand() {
  const q = useQuery({ queryKey: ["brands"], queryFn: api.brands });
  return { brand: q.data?.[0], brands: q.data ?? [], ...q };
}
