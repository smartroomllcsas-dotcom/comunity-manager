"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";

export function useDashboardStats() {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();

  return useQuery({
    queryKey: ["dashboard-stats", agent?.organization_id],
    queryFn: async () => {
      const orgId = agent!.organization_id;

      const [contacts, conversations, agents, messages] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, created_at", { count: "exact" })
          .eq("organization_id", orgId),
        supabase
          .from("conversations")
          .select("id, status, assigned_agent_id, created_at, updated_at")
          .eq("organization_id", orgId),
        supabase
          .from("agents")
          .select("*")
          .eq("organization_id", orgId),
        supabase
          .from("messages")
          .select("id, direction, created_at", { count: "exact" })
          .eq("direction", "outbound"),
      ]);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

      const allContacts = contacts.data || [];
      const allConversations = conversations.data || [];
      const allMessages = messages.data || [];

      const openConvos = allConversations.filter((c) => c.status === "open").length;
      const unassigned = allConversations.filter(
        (c) => c.status === "open" && !c.assigned_agent_id
      ).length;
      const newContactsToday = allContacts.filter(
        (c) => c.created_at >= todayStart
      ).length;
      const messagesToday = allMessages.filter(
        (c) => c.created_at >= todayStart
      ).length;

      // Build conversation chart data for last 14 days
      const chartData: { date: string; count: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
        const count = allConversations.filter(
          (c) => c.created_at >= dayStart && c.created_at < dayEnd
        ).length;
        chartData.push({
          date: d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
          count,
        });
      }

      // Calculate trends: compare today vs yesterday
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const yesterdayEnd = todayStart;

      const newContactsYesterday = allContacts.filter(
        (c) => c.created_at >= yesterdayStart && c.created_at < yesterdayEnd
      ).length;
      const messagesYesterday = allMessages.filter(
        (c) => c.created_at >= yesterdayStart && c.created_at < yesterdayEnd
      ).length;

      // Previous week contacts total (rough: contacts created before today)
      const prevWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString();
      const prevWeekEnd = weekStart;
      const contactsPrevWeek = allContacts.filter(
        (c) => c.created_at >= prevWeekStart && c.created_at < prevWeekEnd
      ).length;
      const contactsThisWeek = allContacts.filter(
        (c) => c.created_at >= weekStart && c.created_at < todayStart
      ).length;

      // Conversations this week vs last week
      const convosPrevWeek = allConversations.filter(
        (c) => c.created_at >= prevWeekStart && c.created_at < prevWeekEnd && c.status === "open"
      ).length;

      function calcTrend(current: number, previous: number): { direction: "up" | "down" | "neutral"; percentage: string } {
        if (previous === 0 && current === 0) return { direction: "neutral", percentage: "" };
        if (previous === 0) return { direction: "up", percentage: "" };
        const change = ((current - previous) / previous) * 100;
        if (change === 0) return { direction: "neutral", percentage: "0%" };
        return {
          direction: change > 0 ? "up" : "down",
          percentage: `${change > 0 ? "+" : ""}${Math.round(change)}%`,
        };
      }

      const contactsTrend = calcTrend(contactsThisWeek, contactsPrevWeek);
      const newContactsTrend = calcTrend(newContactsToday, newContactsYesterday);
      const messagesTodayTrend = calcTrend(messagesToday, messagesYesterday);
      const conversationsTrend = calcTrend(openConvos, convosPrevWeek);

      return {
        totalContacts: contacts.count || allContacts.length,
        activeConversations: openConvos,
        unassigned,
        newContactsToday,
        messagesToday,
        totalMessages: messages.count || allMessages.length,
        totalAgents: agents.data?.length || 0,
        agents: agents.data || [],
        chartData,
        trends: {
          contacts: contactsTrend,
          newContacts: newContactsTrend,
          messages: messagesTodayTrend,
          conversations: conversationsTrend,
        },
      };
    },
    enabled: !!agent,
    refetchInterval: 30000,
  });
}
