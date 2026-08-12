/**
 * Populate the paid QA organization with synthetic plan-limit data.
 *
 * This script is intentionally separate from migrations. It reads web/.env.local
 * when present, targets the QA organization selected by QA_ORGANIZATION_ID,
 * and never creates provider
 * OAuth accounts or stores real access tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.join(webDir, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const targetOrganizationId = process.env.QA_ORGANIZATION_ID?.trim();
const qaPrefix = process.env.QA_SEED_PREFIX?.trim() || "[QA]";
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const smarttalk = createClient(url, serviceKey, { ...options, db: { schema: "smarttalk" } });
const publicDb = createClient(url, serviceKey, { ...options, db: { schema: "public" } });

async function query(client, table, request) {
  const result = await request(client.from(table));
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.data;
}

function fail(message) {
  throw new Error(`[QA seed] ${message}`);
}

const organizations = await query(
  smarttalk,
  "organizations",
  (table) => {
    const scoped = table.select("id,name,plan_id");
    return (targetOrganizationId
      ? scoped.eq("id", targetOrganizationId)
      : scoped.eq("name", "QA Agencia Inicial")
    ).limit(2);
  }
);
if (organizations.length !== 1) fail(`expected exactly one QA organization, found ${organizations.length}`);
const organization = organizations[0];

const subscriptions = await query(
  smarttalk,
  "subscriptions",
  (table) => table
    .select("plan_id,created_at")
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
);
if (subscriptions.length !== 1) fail("target QA organization must have an active subscription");
const planId = subscriptions[0].plan_id;

const [plans, entitlements, agents] = await Promise.all([
  query(smarttalk, "plans", (table) => table.select("id,name,max_contacts").eq("id", planId).limit(1)),
  query(smarttalk, "plan_entitlements", (table) => table
    .select("feature_code,enabled,limit_value")
    .eq("plan_id", planId)
    .in("feature_code", [
      "agency.users",
      "brand.advisors_total",
      "brand.advisors_per_brand",
      "brands.total",
      "channels.active",
      "broadcasts.month",
      "automations.flows",
    ])),
  query(smarttalk, "agents", (table) => table
    .select("id,email,role,created_at")
    .eq("organization_id", organization.id)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(10)),
]);
const plan = plans[0];
if (!plan) fail("active subscription plan was not found");
const entitlement = (code) => entitlements.find((item) => item.feature_code === code && item.enabled);
const entitlementLimit = (code) => entitlement(code)?.limit_value;
const maxAgencyUsers = entitlementLimit("agency.users");
const maxAdvisors = entitlementLimit("brand.advisors_total");
const maxAdvisorsPerBrand = entitlementLimit("brand.advisors_per_brand");
const maxBrands = entitlement("brands.total")?.limit_value;
const maxChannels = entitlement("channels.active")?.limit_value;
const maxBroadcasts = entitlementLimit("broadcasts.month");
const maxFlows = entitlementLimit("automations.flows");
const maxContacts = plan.max_contacts;
if (![maxAgencyUsers, maxAdvisors, maxAdvisorsPerBrand, maxBrands, maxChannels, maxBroadcasts, maxFlows, maxContacts]
  .every((value) => Number.isInteger(value) && value > 0)) {
  fail("the active plan must have finite positive limits for the QA dataset");
}
if (maxChannels < 1) fail(`plan exposes no channel slots for this QA dataset`);

const adminEmails = agents.map((agent) => agent.email.toLowerCase());
const cmUsers = await query(
  publicDb,
  "cm_users",
  (table) => table.select("id,email").in("email", adminEmails).limit(10)
);
const cmUser = cmUsers[0];
if (!cmUser) fail("no linked admin exists in public.cm_users");

let brands = await query(
  publicDb,
  "cm_clients",
  (table) => table
    .select("id,name,smarttalk_organization_id")
    .eq("smarttalk_organization_id", organization.id)
    .order("created_at", { ascending: true })
);
if (brands.length > maxBrands) fail(`organization already has ${brands.length} brands; plan limit is ${maxBrands}`);

for (let index = 1; index <= maxBrands; index += 1) {
  const name = `${qaPrefix} Marca Limite ${String(index).padStart(2, "0")}`;
  if (brands.some((brand) => brand.name === name)) continue;
  if (brands.length >= maxBrands) fail("existing non-QA brands consume the remaining brand slots");
  const created = await query(publicDb, "cm_clients", (table) => table.insert({
    user_id: cmUser.id,
    smarttalk_organization_id: organization.id,
    name,
    industry: "QA - prueba de limites",
    platforms: ["Instagram", "Facebook", "WhatsApp"],
    language: "es",
    status: "onboarding",
  }).select("id,name,smarttalk_organization_id"));
  brands = [...brands, created[0]];
}

let channels = await query(
  smarttalk,
  "channels",
  (table) => table.select("id,brand_id,type,status,name,config").eq("organization_id", organization.id)
);
const activeChannels = channels.filter((channel) => channel.status === "active");
if (activeChannels.some((channel) => channel.config?.qa_seed !== true)) {
  fail("real active channels exist in target organization; no channel was modified");
}
if (activeChannels.length > maxChannels) fail(`active channel count ${activeChannels.length} exceeds limit ${maxChannels}`);

const channelBases = [
  { seed: "facebook", type: "facebook_messenger", label: "Facebook" },
  { seed: "instagram", type: "instagram", label: "Instagram" },
  { seed: "whatsapp", type: "whatsapp_cloud_api", label: "WhatsApp" },
];
const channelDefinitions = Array.from({ length: maxChannels }, (_, offset) => {
  const base = channelBases[offset % channelBases.length];
  const number = offset + 1;
  return {
    seed: `${base.seed}-${String(number).padStart(2, "0")}`,
    type: base.type,
    label: `${base.label} ${String(number).padStart(2, "0")}`,
    sampleIndex: number,
  };
});
const seededChannels = [];
for (let index = 0; index < channelDefinitions.length; index += 1) {
  const definition = channelDefinitions[index];
  let channel = channels.find((item) => item.config?.qa_seed_code === definition.seed);
  const brand = brands[index % brands.length];
  if (!brand) fail(`missing brand for synthetic ${definition.label} channel`);
  if (!channel) {
    const created = await query(smarttalk, "channels", (table) => table.insert({
      organization_id: organization.id,
      brand_id: brand.id,
      type: definition.type,
      name: `${qaPrefix} ${definition.label} - Canal simulado`,
      status: "active",
      config: {
        qa_seed: true,
        qa_seed_code: definition.seed,
        synthetic: true,
        non_operational: true,
        note: "Synthetic QA channel. No provider credentials.",
      },
      connected_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    }).select("id,brand_id,type,status,name,config"));
    channel = created[0];
    channels = [...channels, channel];
  }
  seededChannels.push({ ...definition, ...channel, brand_id: brand.id });
}

let contacts = await query(
  smarttalk,
  "contacts",
  (table) => table.select("id,wa_id,brand_id,custom_fields").eq("organization_id", organization.id)
);
if (contacts.length > maxContacts) fail(`contact count ${contacts.length} exceeds limit ${maxContacts}`);

const existingWaIds = new Set(contacts.map((contact) => contact.wa_id));
const rows = [];
for (let index = 1; contacts.length + rows.length < maxContacts; index += 1) {
  const channel = seededChannels[(index - 1) % seededChannels.length];
  const waId = `qa-${channel.seed}-${String(index).padStart(5, "0")}`;
  if (existingWaIds.has(waId)) continue;
  existingWaIds.add(waId);
  rows.push({
    organization_id: organization.id,
    brand_id: channel.brand_id,
    wa_id: waId,
    name: `QA Lead ${channel.label} ${String(index).padStart(5, "0")}`,
    tags: ["qa-seed", "synthetic"],
    custom_fields: { qa_seed: true, synthetic: true, seed_channel: channel.seed },
  });
}
for (let offset = 0; offset < rows.length; offset += 200) {
  const batch = rows.slice(offset, offset + 200);
  const inserted = await query(smarttalk, "contacts", (table) => table.insert(batch).select("id,wa_id,brand_id,custom_fields"));
  contacts = [...contacts, ...inserted];
}

const qaContacts = contacts.filter((contact) => contact.custom_fields?.qa_seed === true);
for (const channel of seededChannels) {
  let contact = qaContacts.find(
    (item) => item.wa_id === `qa-${channel.seed}-${String(channel.sampleIndex).padStart(5, "0")}`
  );
  contact ||= qaContacts.find((item) => item.custom_fields?.seed_channel === channel.seed);
  if (!contact) continue;
  const existingConversations = await query(
    smarttalk,
    "conversations",
    (table) => table.select("id,contact_id,metadata").eq("organization_id", organization.id).limit(1000)
  );
  const channelConversations = existingConversations.filter(
    (item) => item.metadata?.qa_seed === true && item.metadata?.seed_channel === channel.seed
  );
  let conversation = channelConversations[0];
  if (conversation?.contact_id) {
    contact = contacts.find((item) => item.id === conversation.contact_id) || contact;
  }
  for (const duplicate of channelConversations.slice(1)) {
    await query(smarttalk, "messages", (table) => table.delete().eq("conversation_id", duplicate.id));
    await query(smarttalk, "conversations", (table) => table.delete().eq("id", duplicate.id));
  }
  const message = `Mensaje de prueba QA recibido por ${channel.label}.`;
  if (!conversation) {
    const created = await query(smarttalk, "conversations", (table) => table.insert({
      organization_id: organization.id,
      brand_id: channel.brand_id,
      channel_id: channel.id,
      contact_id: contact.id,
      status: "open",
      priority: "medium",
      unread_count: 1,
      last_message_preview: message,
      metadata: { qa_seed: true, synthetic: true, seed_channel: channel.seed },
    }).select("id,metadata"));
    conversation = created[0];
  }
  const providerMessageId = `qa-seed:${channel.seed}`;
  const existingMessages = await query(
    smarttalk,
    "messages",
    (table) => table.select("id").eq("wa_message_id", providerMessageId).limit(1)
  );
  if (existingMessages.length === 0) {
    await query(smarttalk, "messages", (table) => table.insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      direction: "inbound",
      type: "text",
      content: { type: "text", text: message },
      wa_message_id: providerMessageId,
      status: "delivered",
      is_bot: false,
    }).select("id"));
  }
  await query(smarttalk, "contacts", (table) => table.update({ last_message_at: new Date().toISOString() }).eq("id", contact.id));
  await query(smarttalk, "conversations", (table) => table.update({
    last_message_preview: message,
    unread_count: 1,
    updated_at: new Date().toISOString(),
  }).eq("id", conversation.id));
}

const qaAdmin = agents[0];
if (!qaAdmin) fail("no agency administrator is available to own QA invitations");

async function ensureInvitation({ email, role, memberType, brandIds = [] }) {
  let existing = await query(
    smarttalk,
    "invitations",
    (table) => table
      .select("id,email,role,status,member_type")
      .eq("organization_id", organization.id)
      .eq("email", email)
      .limit(1)
  );
  let invitation = existing[0];
  if (invitation && (invitation.member_type !== memberType || invitation.role !== role)) {
    fail(`existing QA invitation ${email} has a different member type or role`);
  }
  if (!invitation) {
    const created = await query(smarttalk, "invitations", (table) => table.insert({
      organization_id: organization.id,
      email,
      role,
      member_type: memberType,
      status: "pending",
      invited_by: qaAdmin.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select("id,email,role,status,member_type"));
    invitation = created[0];
  }

  if (brandIds.length > 0) {
    const assignments = await query(
      smarttalk,
      "invitation_brand_assignments",
      (table) => table
        .select("brand_id")
        .eq("organization_id", organization.id)
        .eq("invitation_id", invitation.id)
    );
    const assigned = new Set(assignments.map((item) => item.brand_id));
    const missingBrandIds = brandIds.filter((brandId) => !assigned.has(brandId));
    if (missingBrandIds.length > 0) {
      await query(smarttalk, "invitation_brand_assignments", (table) => table.insert(
        missingBrandIds.map((brandId) => ({
          organization_id: organization.id,
          invitation_id: invitation.id,
          brand_id: brandId,
        }))
      ).select("id"));
    }
  }
  return invitation;
}

const agencyUsers = await query(
  smarttalk,
  "agents",
  (table) => table.select("id").eq("organization_id", organization.id).eq("member_type", "agency_user")
);
const pendingAgencyInvitations = await query(
  smarttalk,
  "invitations",
  (table) => table.select("id").eq("organization_id", organization.id).eq("member_type", "agency_user").eq("status", "pending")
);
if (agencyUsers.length + pendingAgencyInvitations.length > maxAgencyUsers) {
  fail(`agency user count exceeds limit ${maxAgencyUsers}`);
}
const currentAgencySeats = agencyUsers.length + pendingAgencyInvitations.length;
for (let index = currentAgencySeats + 1; index <= maxAgencyUsers; index += 1) {
  await ensureInvitation({
    email: `qa-agency-user-${String(index).padStart(2, "0")}@communitymanager.invalid`,
    role: "agent",
    memberType: "agency_user",
  });
}

const advisorInvitations = [];
for (let index = 0; index < maxAdvisors; index += 1) {
  const brand = brands[index % brands.length];
  advisorInvitations.push(await ensureInvitation({
    email: `qa-brand-advisor-${String(index + 1).padStart(2, "0")}@communitymanager.invalid`,
    role: "agent",
    memberType: "brand_advisor",
    brandIds: [brand.id],
  }));
}

const brandAdminInvitations = [];
for (let index = 0; index < maxBrands; index += 1) {
  const brand = brands[index];
  brandAdminInvitations.push(await ensureInvitation({
    email: `qa-brand-admin-${String(index + 1).padStart(2, "0")}@communitymanager.invalid`,
    role: "supervisor",
    memberType: "brand_admin",
    brandIds: [brand.id],
  }));
}

const qaTemplateName = `${qaPrefix} Plantilla Sintética`;
let templates = await query(
  smarttalk,
  "message_templates",
  (table) => table.select("id,name").eq("organization_id", organization.id).eq("name", qaTemplateName).limit(1)
);
let qaTemplate = templates[0];
if (!qaTemplate) {
  const created = await query(smarttalk, "message_templates", (table) => table.insert({
    organization_id: organization.id,
    name: qaTemplateName,
    language: "es",
    category: "utility",
    components: [],
    status: "approved",
  }).select("id,name"));
  qaTemplate = created[0];
}

for (let index = 1; index <= maxBroadcasts; index += 1) {
  const name = `${qaPrefix} Difusión Sintética ${String(index).padStart(2, "0")}`;
  const existing = await query(
    smarttalk,
    "broadcasts",
    (table) => table.select("id").eq("organization_id", organization.id).eq("name", name).limit(1)
  );
  if (existing.length > 0) continue;
  await query(smarttalk, "broadcasts", (table) => table.insert({
    organization_id: organization.id,
    name,
    template_id: qaTemplate.id,
    channel_id: seededChannels[(index - 1) % seededChannels.length].id,
    contact_filter: { qa_seed: true, synthetic: true },
    status: "completed",
  }).select("id"));
}

for (let index = 1; index <= maxFlows; index += 1) {
  const name = `${qaPrefix} Flujo Sintético ${String(index).padStart(2, "0")}`;
  const existing = await query(
    smarttalk,
    "chatbot_flows",
    (table) => table.select("id").eq("organization_id", organization.id).eq("name", name).limit(1)
  );
  if (existing.length > 0) continue;
  await query(smarttalk, "chatbot_flows", (table) => table.insert({
    organization_id: organization.id,
    name,
    trigger_type: "keyword",
    trigger_value: `qa-flow-${String(index).padStart(2, "0")}`,
    flow_data: { nodes: [] },
    is_active: false,
  }).select("id"));
}

const [finalBrands, finalChannels, finalContacts, finalConversations, finalAgents, finalInvitations, finalBroadcasts, finalFlows] = await Promise.all([
  query(publicDb, "cm_clients", (table) => table.select("id").eq("smarttalk_organization_id", organization.id)),
  query(smarttalk, "channels", (table) => table.select("id,brand_id,name,config").eq("organization_id", organization.id).eq("status", "active")),
  query(smarttalk, "contacts", (table) => table.select("id,brand_id,custom_fields").eq("organization_id", organization.id)),
  query(smarttalk, "conversations", (table) => table.select("id,metadata").eq("organization_id", organization.id)),
  query(smarttalk, "agents", (table) => table.select("id,member_type").eq("organization_id", organization.id)),
  query(smarttalk, "invitations", (table) => table.select("id,member_type,status").eq("organization_id", organization.id)),
  query(smarttalk, "broadcasts", (table) => table.select("id,status").eq("organization_id", organization.id).neq("status", "draft")),
  query(smarttalk, "chatbot_flows", (table) => table.select("id").eq("organization_id", organization.id)),
]);

const channelDistribution = seededChannels.map((channel) => ({
  channel: channel.label,
  brandId: channel.brand_id,
  active: finalChannels.some((item) => item.id === channel.id),
  syntheticContacts: finalContacts.filter(
    (item) => item.brand_id === channel.brand_id && item.custom_fields?.seed_channel === channel.seed
  ).length,
}));

console.log(JSON.stringify({
  organization: organization.name,
  plan: plan.name,
  brands: `${finalBrands.length}/${maxBrands}`,
  activeChannels: `${finalChannels.length}/${maxChannels}`,
  contacts: `${finalContacts.length}/${maxContacts}`,
  agencyUsers: `${finalAgents.filter((item) => item.member_type === "agency_user").length + finalInvitations.filter((item) => item.member_type === "agency_user" && item.status === "pending").length}/${maxAgencyUsers}`,
  brandAdvisors: `${finalAgents.filter((item) => item.member_type === "brand_advisor").length + finalInvitations.filter((item) => item.member_type === "brand_advisor" && item.status === "pending").length}/${maxAdvisors}`,
  brandAdministrators: `${finalAgents.filter((item) => item.member_type === "brand_admin").length + finalInvitations.filter((item) => item.member_type === "brand_admin" && item.status === "pending").length}/${maxBrands}`,
  broadcasts: `${finalBroadcasts.length}/${maxBroadcasts}`,
  flows: `${finalFlows.length}/${maxFlows}`,
  syntheticConversations: finalConversations.filter((item) => item.metadata?.qa_seed === true).length,
  channelDistribution,
}, null, 2));
