"use client";
import type { WaComponent } from "@/lib/whatsapp/cloud/types";

/**
 * Preview visual estilo mock celular WhatsApp. Sustituye {{n}} con muestras.
 */
export function TemplatePreview({
  components,
  samples,
}: {
  components: WaComponent[];
  samples?: string[]; // valores por variable {{1..n}}
}) {
  const header = components.find((c) => c.type === "HEADER");
  const body = components.find((c) => c.type === "BODY");
  const footer = components.find((c) => c.type === "FOOTER");
  const buttons = components.find((c) => c.type === "BUTTONS")?.buttons ?? [];

  function fill(text: string): string {
    if (!samples || samples.length === 0) return text;
    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => samples[Number(n) - 1] ?? `{{${n}}}`);
  }

  return (
    <div className="w-full max-w-[340px] rounded-2xl bg-[#0b141a] p-3 shadow-lg border border-[#233138]">
      <div className="rounded-lg bg-[#005c4b] px-3 py-2 text-white text-sm space-y-1">
        {header && (
          <div className="text-xs opacity-80 mb-1">
            {header.format === "TEXT" && header.text ? (
              <span className="font-semibold">{fill(header.text)}</span>
            ) : header.format ? (
              <span className="italic">📎 {header.format.toLowerCase()}</span>
            ) : null}
          </div>
        )}
        {body?.text && (
          <div className="whitespace-pre-wrap leading-snug">{fill(body.text)}</div>
        )}
        {footer?.text && (
          <div className="text-[11px] opacity-60 pt-1">{footer.text}</div>
        )}
        <div className="text-right text-[10px] opacity-60 pt-1">12:34 ✓✓</div>
      </div>
      {buttons.length > 0 && (
        <div className="mt-1 space-y-1">
          {buttons.map((b, i) => (
            <div
              key={i}
              className="w-full rounded-md bg-[#182229] px-3 py-2 text-center text-sm text-[#00a884] border border-[#233138]"
            >
              {b.type === "URL" && "[link] "}
              {b.type === "PHONE_NUMBER" && "[call] "}
              {b.type === "COPY_CODE" && "[copy] "}
              {b.type === "QUICK_REPLY" && "[reply] "}
              {b.text || b.type}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
