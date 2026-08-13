#!/usr/bin/env node
/**
 * Auditoría de activos de Meta compartidos entre marcas. **SOLO LECTURA.**
 *
 * Por qué existe
 * --------------
 * La corrección del multimarcas impide que un activo nuevo caiga en dos marcas,
 * pero **no toca lo que ya está guardado**. Antes de plantear un índice UNIQUE
 * hay que saber cuántos duplicados existen: crear la restricción a ciegas
 * fallaría en producción a mitad de la migración.
 *
 * Este script no modifica ni borra nada. Sólo cuenta y lista.
 *
 * Qué revisa
 * ----------
 *   1. `smarttalk.channels`   · meta_business_id y whatsapp_phone_number_id
 *   2. `public.cm_social_accounts` · page_id e instagram_id
 *   3. `public.cm_whatsapp_accounts` · phone_number_id
 *
 * Un activo se reporta cuando aparece en **más de una marca de la misma
 * organización**. Entre organizaciones distintas no es un conflicto: son
 * agencias separadas y Meta lo permite.
 *
 * Uso:
 *   node scripts/audit-meta-duplicates.mjs            # resumen legible
 *   node scripts/audit-meta-duplicates.mjs --json     # salida para procesar
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const asJson = process.argv.includes("--json");

function loadEnv() {
  try {
    const raw = readFileSync(path.join(webDir, ".env.local"), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => [
          line.slice(0, line.indexOf("=")).trim(),
          line.slice(line.indexOf("=") + 1).trim(),
        ]),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("\n✖ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n");
  process.exit(1);
}

async function select(schema, resource) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Accept-Profile": schema,
    },
  });
  if (!response.ok) {
    throw new Error(`${schema}.${resource} → HTTP ${response.status}`);
  }
  return response.json();
}

/** Agrupa por activo y devuelve sólo los que tocan más de una marca. */
function findDuplicates(rows, { assetKey, brandKey, orgKey }) {
  const byAsset = new Map();
  for (const row of rows) {
    const asset = row[assetKey];
    const brand = row[brandKey];
    if (!asset || !brand) continue;
    // La organización agrupa: el mismo activo en dos agencias no es conflicto.
    const key = `${row[orgKey] ?? "sin-org"}::${asset}`;
    const entry = byAsset.get(key) || { asset, organizationId: row[orgKey] ?? null, brands: new Set() };
    entry.brands.add(brand);
    byAsset.set(key, entry);
  }
  return [...byAsset.values()]
    .filter((entry) => entry.brands.size > 1)
    .map((entry) => ({ ...entry, brands: [...entry.brands] }));
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), findings: [] };

  const channels = await select(
    "smarttalk",
    "channels?select=id,organization_id,brand_id,type,status,meta_business_id,whatsapp_phone_number_id",
  );
  const socials = await select(
    "public",
    "cm_social_accounts?select=id,client_id,organization_id,page_id,instagram_id",
  );
  const waAccounts = await select(
    "public",
    "cm_whatsapp_accounts?select=id,client_id,phone_number_id",
  );
  const brands = await select("public", "cm_clients?select=id,name,status,smarttalk_organization_id");
  const brandName = new Map(brands.map((brand) => [brand.id, brand.name]));
  const brandStatus = new Map(brands.map((brand) => [brand.id, brand.status]));
  const brandOrg = new Map(brands.map((brand) => [brand.id, brand.smarttalk_organization_id]));

  // Sólo cuentan los canales que reclaman el activo: uno desconectado no.
  const liveChannels = channels.filter((channel) => channel.status !== "disconnected");

  const checks = [
    {
      label: "smarttalk.channels · meta_business_id (Facebook/Instagram)",
      rows: liveChannels,
      options: { assetKey: "meta_business_id", brandKey: "brand_id", orgKey: "organization_id" },
    },
    {
      label: "smarttalk.channels · whatsapp_phone_number_id",
      rows: liveChannels,
      options: {
        assetKey: "whatsapp_phone_number_id",
        brandKey: "brand_id",
        orgKey: "organization_id",
      },
    },
    {
      label: "cm_social_accounts · page_id",
      rows: socials.map((row) => ({
        ...row,
        organization_id: row.organization_id ?? brandOrg.get(row.client_id) ?? null,
      })),
      options: { assetKey: "page_id", brandKey: "client_id", orgKey: "organization_id" },
    },
    {
      label: "cm_social_accounts · instagram_id",
      rows: socials.map((row) => ({
        ...row,
        organization_id: row.organization_id ?? brandOrg.get(row.client_id) ?? null,
      })),
      options: { assetKey: "instagram_id", brandKey: "client_id", orgKey: "organization_id" },
    },
    {
      label: "cm_whatsapp_accounts · phone_number_id",
      rows: waAccounts.map((row) => ({
        ...row,
        organization_id: brandOrg.get(row.client_id) ?? null,
      })),
      options: { assetKey: "phone_number_id", brandKey: "client_id", orgKey: "organization_id" },
    },
  ];

  for (const check of checks) {
    const duplicates = findDuplicates(check.rows, check.options);
    report.findings.push({
      source: check.label,
      total: duplicates.length,
      duplicates: duplicates.map((entry) => ({
        asset: entry.asset,
        organizationId: entry.organizationId,
        brands: entry.brands.map((id) => ({
          id,
          name: brandName.get(id) ?? null,
          status: brandStatus.get(id) ?? null,
        })),
      })),
    });
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\n=== Auditoría de activos de Meta compartidos entre marcas ===");
  console.log(`Generada: ${report.generatedAt}`);
  console.log("SOLO LECTURA: este script no modifica ni borra nada.\n");

  let total = 0;
  for (const finding of report.findings) {
    total += finding.total;
    console.log(`${finding.total === 0 ? "✓" : "✗"} ${finding.source}: ${finding.total} duplicado(s)`);
    for (const duplicate of finding.duplicates) {
      const marcas = duplicate.brands
        .map((brand) => `${brand.name || brand.id}${brand.status === "paused" ? " (inactiva)" : ""}`)
        .join(" · ");
      console.log(`    ${duplicate.asset} → ${marcas}`);
    }
  }

  console.log(`\nTotal de activos compartidos: ${total}`);
  if (total === 0) {
    console.log(
      "\nNo hay duplicados. Una migración de unicidad podría aplicarse sin\n" +
        "romper datos existentes, pero conviene repetir esta auditoría justo\n" +
        "antes de aplicarla.\n",
    );
  } else {
    console.log(
      "\nCorrección propuesta, en este orden:\n" +
        "  1. Decidir con negocio qué marca conserva cada activo.\n" +
        "  2. Desconectar el activo en las demás (status='disconnected'), sin\n" +
        "     borrar filas: el histórico de conversaciones se conserva.\n" +
        "  3. Volver a ejecutar esta auditoría hasta que dé 0.\n" +
        "  4. Sólo entonces evaluar el índice UNIQUE en una migración aparte.\n",
    );
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}\n`);
  process.exit(1);
});
