import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mappingRaw = formData.get("mapping") as string | null;

    if (!file) {
      return Response.json({ error: "Archivo CSV requerido" }, { status: 400 });
    }

    const mapping: Record<string, string> = mappingRaw ? JSON.parse(mappingRaw) : {};

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return Response.json({ error: "El archivo CSV debe tener al menos una fila de datos" }, { status: 400 });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Build effective mapping: csv column index -> contact field
    const effectiveMapping: Record<number, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      if (mapping[headers[i]]) {
        effectiveMapping[i] = mapping[headers[i]];
      } else if (header === "nombre" || header === "name") {
        effectiveMapping[i] = "name";
      } else if (header === "telefono" || header === "phone" || header === "wa_id") {
        effectiveMapping[i] = "wa_id";
      } else if (header === "email" || header === "correo") {
        effectiveMapping[i] = "email";
      } else if (header === "tags" || header === "etiquetas") {
        effectiveMapping[i] = "tags";
      }
    }

    // Check that wa_id is mapped
    const hasPhone = Object.values(effectiveMapping).includes("wa_id");
    if (!hasPhone) {
      return Response.json({
        error: "El archivo debe tener una columna de telefono (telefono, phone, wa_id)",
      }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      try {
        const record: Record<string, string> = {};
        for (const [colIdx, field] of Object.entries(effectiveMapping)) {
          record[field] = (row[parseInt(colIdx)] || "").trim();
        }

        let phone = record.wa_id || "";
        // Normalize phone: remove spaces, dashes, parentheses
        phone = phone.replace(/[\s\-\(\)]/g, "");
        // Ensure starts with + or is digits only
        if (!phone || phone.length < 7) {
          skipped++;
          continue;
        }

        // Check if contact exists
        const { data: existingContact } = await admin
          .from("contacts")
          .select("id, custom_fields, tags")
          .eq("organization_id", agent.organization_id)
          .eq("wa_id", phone)
          .single();

        const tags = record.tags
          ? record.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
          : [];

        const customFields: Record<string, string> = {};
        if (record.email) customFields.email = record.email;

        // Add any extra mapped fields to custom_fields
        for (const [, field] of Object.entries(effectiveMapping)) {
          if (!["name", "wa_id", "tags", "email"].includes(field) && record[field]) {
            customFields[field] = record[field];
          }
        }

        if (existingContact) {
          // Update existing contact
          const mergedCustomFields = { ...existingContact.custom_fields, ...customFields };
          const mergedTags = [...new Set([...(existingContact.tags || []), ...tags])];

          await admin
            .from("contacts")
            .update({
              name: record.name || undefined,
              custom_fields: mergedCustomFields,
              tags: mergedTags,
            })
            .eq("id", existingContact.id);

          updated++;
        } else {
          // Create new contact
          await admin
            .from("contacts")
            .insert({
              organization_id: agent.organization_id,
              wa_id: phone,
              name: record.name || null,
              tags,
              custom_fields: customFields,
            });

          imported++;
        }
      } catch (err) {
        errors.push(`Fila ${rowIdx + 2}: ${err instanceof Error ? err.message : "Error desconocido"}`);
        skipped++;
      }
    }

    return Response.json({
      imported,
      updated,
      skipped,
      total: dataRows.length,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return Response.json({
      error: `Error procesando archivo: ${err instanceof Error ? err.message : "Error desconocido"}`,
    }, { status: 500 });
  }
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        current.push(field);
        field = "";
      } else if (char === "\n" || (char === "\r" && next === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim())) lines.push(current);
        current = [];
        if (char === "\r") i++;
      } else {
        field += char;
      }
    }
  }

  // Last field/line
  current.push(field);
  if (current.some((c) => c.trim())) lines.push(current);

  return lines;
}
