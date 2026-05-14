"use client";
import { useQuery } from "@tanstack/react-query";
import type { ContactFieldDefinition } from "@/types/database";

export function useContactFields() {
  return useQuery<ContactFieldDefinition[]>({
    queryKey: ["contact-fields"],
    queryFn: async () => {
      const res = await fetch("/api/contact-fields");
      if (!res.ok) throw new Error("Error al cargar campos de contacto");
      const data = await res.json();
      return data.fields;
    },
  });
}
