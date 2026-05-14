"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentAgent } from "./useCurrentAgent";

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  agentId?: string;
  channelId?: string;
}

export interface DailyCount {
  date: string;
  label: string;
  count: number;
}

export interface DualDailyCount {
  date: string;
  label: string;
  inbound: number;
  outbound: number;
}

export interface ConversationDailyCount {
  date: string;
  label: string;
  opened: number;
  closed: number;
}

export interface AgentPerformance {
  id: string;
  name: string;
  assignedConversations: number;
  closedConversations: number;
  messagesSent: number;
  avgResponseTimeMs: number;
}

export interface BroadcastMetric {
  id: string;
  name: string;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
  deliveryRate: number;
  readRate: number;
}

export interface ReportsData {
  /* Overview */
  totalConversations: number;
  resolvedConversations: number;
  resolutionRate: number;
  avgResponseTimeMs: number;
  newContacts: number;
  totalContacts: number;

  /* Conversations */
  conversationsPerDay: ConversationDailyCount[];
  conversationsByStatus: { status: string; count: number }[];
  conversationsByChannel: { channel: string; count: number }[];
  recentClosedConversations: {
    contactName: string;
    channel: string;
    openedAt: string;
    closedAt: string;
    category: string;
    agent: string;
  }[];

  /* Messages */
  totalInbound: number;
  totalOutbound: number;
  messagesPerDay: DualDailyCount[];
  messagesByType: { type: string; count: number }[];
  messagesByHour: { hour: number; count: number }[];

  /* Contacts */
  contactsPerDay: DailyCount[];
  contactsByChannel: { channel: string; count: number }[];
  contactsByLifecycle: { stage: string; color: string; count: number }[];

  /* Agents */
  agentPerformance: AgentPerformance[];

  /* Broadcasts */
  broadcastMetrics: BroadcastMetric[];
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function dayRange(from: string, to: string): Date[] {
  const days: Date[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useReports(filters: ReportFilters) {
  const supabase = createClient();
  const { data: agent } = useCurrentAgent();

  return useQuery<ReportsData>({
    queryKey: ["reports", agent?.organization_id, filters],
    queryFn: async () => {
      const orgId = agent!.organization_id;
      const from = filters.dateFrom;
      const toNext = new Date(filters.dateTo);
      toNext.setDate(toNext.getDate() + 1);
      const toExclusive = toNext.toISOString();

      /* Parallel fetches */
      const [
        contactsRes,
        conversationsRes,
        messagesRes,
        agentsRes,
        broadcastsRes,
        channelsRes,
        lifecycleRes,
        totalContactsRes,
      ] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, created_at, lifecycle_stage_id")
          .eq("organization_id", orgId)
          .gte("created_at", from)
          .lt("created_at", toExclusive),
        supabase
          .from("conversations")
          .select("id, status, assigned_agent_id, channel_id, opened_at, resolved_at, created_at, updated_at, closing_category, first_response_at, contact:contacts(name), assigned_agent:agents(name), channel:channels(name)")
          .eq("organization_id", orgId)
          .gte("created_at", from)
          .lt("created_at", toExclusive),
        supabase
          .from("messages")
          .select("id, direction, type, created_at, agent_id, conversation_id")
          .gte("created_at", from)
          .lt("created_at", toExclusive),
        supabase
          .from("agents")
          .select("id, name")
          .eq("organization_id", orgId),
        supabase
          .from("broadcasts")
          .select("id, name, sent_count, delivered_count, read_count, failed_count, created_at")
          .eq("organization_id", orgId)
          .gte("created_at", from)
          .lt("created_at", toExclusive)
          .order("created_at", { ascending: false }),
        supabase
          .from("channels")
          .select("id, name")
          .eq("organization_id", orgId),
        supabase
          .from("lifecycle_stages")
          .select("id, name, color")
          .eq("organization_id", orgId)
          .order("position"),
        supabase
          .from("contacts")
          .select("id", { count: "exact" })
          .eq("organization_id", orgId),
      ]);

      const contacts = contactsRes.data || [];
      const conversations = conversationsRes.data || [];
      const messages = messagesRes.data || [];
      const agents = agentsRes.data || [];
      const broadcasts = broadcastsRes.data || [];
      const channels = channelsRes.data || [];
      const lifecycleStages = lifecycleRes.data || [];
      const totalContacts = totalContactsRes.count || 0;

      /* Build channel map */
      const channelMap = new Map<string, string>();
      channels.forEach((ch: { id: string; name: string }) => channelMap.set(ch.id, ch.name));

      /* Agent map */
      const agentMap = new Map<string, string>();
      agents.forEach((a: { id: string; name: string }) => agentMap.set(a.id, a.name));

      /* Days in range */
      const days = dayRange(from, filters.dateTo);

      /* ---------- Overview ---------- */
      const totalConversations = conversations.length;
      const resolvedConversations = conversations.filter(
        (c: any) => c.status === "resolved" || c.status === "closed"
      ).length;
      const resolutionRate = totalConversations > 0 ? Math.round((resolvedConversations / totalConversations) * 100) : 0;

      /* Avg first response time */
      const responseTimes: number[] = [];
      conversations.forEach((c: any) => {
        if (c.first_response_at && c.opened_at) {
          const diff = new Date(c.first_response_at).getTime() - new Date(c.opened_at).getTime();
          if (diff > 0) responseTimes.push(diff);
        }
      });
      const avgResponseTimeMs = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : 0;

      const newContacts = contacts.length;

      /* ---------- Conversations per day ---------- */
      const conversationsPerDay: ConversationDailyCount[] = days.map((d) => {
        const dayStr = isoDay(d);
        const opened = conversations.filter((c: any) => c.created_at?.slice(0, 10) === dayStr).length;
        const closed = conversations.filter(
          (c: any) =>
            (c.status === "resolved" || c.status === "closed") &&
            (c.resolved_at?.slice(0, 10) === dayStr || c.updated_at?.slice(0, 10) === dayStr)
        ).length;
        return { date: dayStr, label: formatDayLabel(d), opened, closed };
      });

      /* Conversations by status */
      const statusCounts = new Map<string, number>();
      conversations.forEach((c: any) => {
        statusCounts.set(c.status, (statusCounts.get(c.status) || 0) + 1);
      });
      const conversationsByStatus = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }));

      /* Conversations by channel */
      const channelCounts = new Map<string, number>();
      conversations.forEach((c: any) => {
        const name = c.channel?.name || (c.channel_id ? channelMap.get(c.channel_id) : null) || "Sin canal";
        channelCounts.set(name, (channelCounts.get(name) || 0) + 1);
      });
      const conversationsByChannel = Array.from(channelCounts.entries()).map(([channel, count]) => ({ channel, count }));

      /* Recent closed conversations */
      const closedConvos = conversations
        .filter((c: any) => c.status === "resolved" || c.status === "closed")
        .sort((a: any, b: any) => (b.resolved_at || b.updated_at || "").localeCompare(a.resolved_at || a.updated_at || ""))
        .slice(0, 20);

      const recentClosedConversations = closedConvos.map((c: any) => ({
        contactName: c.contact?.name || "Sin nombre",
        channel: c.channel?.name || (c.channel_id ? channelMap.get(c.channel_id) : null) || "—",
        openedAt: c.opened_at || c.created_at,
        closedAt: c.resolved_at || c.updated_at || "",
        category: c.closing_category || "—",
        agent: c.assigned_agent?.name || (c.assigned_agent_id ? agentMap.get(c.assigned_agent_id) : null) || "—",
      }));

      /* ---------- Messages ---------- */
      const totalInbound = messages.filter((m: any) => m.direction === "inbound").length;
      const totalOutbound = messages.filter((m: any) => m.direction === "outbound").length;

      const messagesPerDay: DualDailyCount[] = days.map((d) => {
        const dayStr = isoDay(d);
        const dayMsgs = messages.filter((m: any) => m.created_at?.slice(0, 10) === dayStr);
        return {
          date: dayStr,
          label: formatDayLabel(d),
          inbound: dayMsgs.filter((m: any) => m.direction === "inbound").length,
          outbound: dayMsgs.filter((m: any) => m.direction === "outbound").length,
        };
      });

      /* Messages by type */
      const typeCounts = new Map<string, number>();
      messages.forEach((m: any) => {
        typeCounts.set(m.type, (typeCounts.get(m.type) || 0) + 1);
      });
      const messagesByType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count }));

      /* Messages by hour */
      const hourCounts = new Array(24).fill(0);
      messages.forEach((m: any) => {
        const h = new Date(m.created_at).getHours();
        hourCounts[h]++;
      });
      const messagesByHour = hourCounts.map((count, hour) => ({ hour, count }));

      /* ---------- Contacts ---------- */
      const contactsPerDay: DailyCount[] = days.map((d) => {
        const dayStr = isoDay(d);
        return {
          date: dayStr,
          label: formatDayLabel(d),
          count: contacts.filter((c: any) => c.created_at?.slice(0, 10) === dayStr).length,
        };
      });

      /* Contacts by channel — use conversations to infer */
      const contactChannelMap = new Map<string, Set<string>>();
      conversations.forEach((c: any) => {
        if (c.contact?.name) {
          const ch = c.channel?.name || "Sin canal";
          if (!contactChannelMap.has(ch)) contactChannelMap.set(ch, new Set());
          contactChannelMap.get(ch)!.add(c.contact.name);
        }
      });
      const contactsByChannel = Array.from(contactChannelMap.entries()).map(([channel, s]) => ({ channel, count: s.size }));

      /* Contacts by lifecycle */
      const lifecycleCounts = new Map<string, number>();
      const lifecycleColorMap = new Map<string, string>();
      lifecycleStages.forEach((ls: any) => {
        lifecycleCounts.set(ls.name, 0);
        lifecycleColorMap.set(ls.id, ls.color);
      });
      contacts.forEach((c: any) => {
        if (c.lifecycle_stage_id) {
          const stage = lifecycleStages.find((ls: any) => ls.id === c.lifecycle_stage_id);
          if (stage) lifecycleCounts.set(stage.name, (lifecycleCounts.get(stage.name) || 0) + 1);
        }
      });
      const contactsByLifecycle = lifecycleStages.map((ls: any) => ({
        stage: ls.name,
        color: ls.color,
        count: lifecycleCounts.get(ls.name) || 0,
      }));

      /* ---------- Agent Performance ---------- */
      const agentPerformance: AgentPerformance[] = agents.map((a: any) => {
        const agentConvos = conversations.filter((c: any) => c.assigned_agent_id === a.id);
        const agentClosed = agentConvos.filter(
          (c: any) => c.status === "resolved" || c.status === "closed"
        ).length;
        const agentMsgs = messages.filter((m: any) => m.agent_id === a.id && m.direction === "outbound").length;

        const agentResponseTimes: number[] = [];
        agentConvos.forEach((c: any) => {
          if (c.first_response_at && c.opened_at) {
            const diff = new Date(c.first_response_at).getTime() - new Date(c.opened_at).getTime();
            if (diff > 0) agentResponseTimes.push(diff);
          }
        });
        const avgRT = agentResponseTimes.length > 0
          ? Math.round(agentResponseTimes.reduce((a, b) => a + b, 0) / agentResponseTimes.length)
          : 0;

        return {
          id: a.id,
          name: a.name,
          assignedConversations: agentConvos.length,
          closedConversations: agentClosed,
          messagesSent: agentMsgs,
          avgResponseTimeMs: avgRT,
        };
      });

      /* ---------- Broadcasts ---------- */
      const broadcastMetrics: BroadcastMetric[] = broadcasts.map((b: any) => {
        const total = b.sent_count || 0;
        return {
          id: b.id,
          name: b.name,
          sentCount: total,
          deliveredCount: b.delivered_count || 0,
          readCount: b.read_count || 0,
          failedCount: b.failed_count || 0,
          createdAt: b.created_at,
          deliveryRate: total > 0 ? Math.round(((b.delivered_count || 0) / total) * 100) : 0,
          readRate: total > 0 ? Math.round(((b.read_count || 0) / total) * 100) : 0,
        };
      });

      return {
        totalConversations,
        resolvedConversations,
        resolutionRate,
        avgResponseTimeMs,
        newContacts,
        totalContacts,
        conversationsPerDay,
        conversationsByStatus,
        conversationsByChannel,
        recentClosedConversations,
        totalInbound,
        totalOutbound,
        messagesPerDay,
        messagesByType,
        messagesByHour,
        contactsPerDay,
        contactsByChannel,
        contactsByLifecycle,
        agentPerformance,
        broadcastMetrics,
      };
    },
    enabled: !!agent,
    refetchInterval: 60000,
  });
}
