"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";
import type { Contact } from "@/types/database";

interface UseContactsOptions {
  searchQuery?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}

interface UseContactsResult {
  contacts: Contact[];
  totalCount: number;
}

export function useContacts(searchQueryOrOptions?: string | UseContactsOptions, tags?: string[]) {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();

  // Support both old signature (searchQuery, tags) and new options object
  const options: UseContactsOptions =
    typeof searchQueryOrOptions === "string"
      ? { searchQuery: searchQueryOrOptions, tags }
      : searchQueryOrOptions ?? {};

  const {
    searchQuery,
    tags: optionTags,
    page = 0,
    pageSize = 100,
  } = options;

  const effectiveTags = optionTags ?? tags;

  return useQuery<UseContactsResult>({
    queryKey: ["contacts", agent?.organization_id, searchQuery, effectiveTags, page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .eq("organization_id", agent!.organization_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(from, to);

      if (searchQuery) query = query.or(`name.ilike.%${searchQuery}%,wa_id.ilike.%${searchQuery}%`);
      if (effectiveTags && effectiveTags.length > 0) query = query.overlaps("tags", effectiveTags);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        contacts: data || [],
        totalCount: count ?? 0,
      };
    },
    enabled: !!agent,
  });
}
