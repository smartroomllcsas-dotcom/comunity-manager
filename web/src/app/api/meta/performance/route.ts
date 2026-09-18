/**
 * Rendimiento por anuncio cruzado con los leads que trajo.
 *
 * GET /api/meta/performance?clientId=&range=last_30d
 *                          o &since=YYYY-MM-DD&until=YYYY-MM-DD
 */
import { NextRequest, NextResponse } from "next/server";
import { AD_DATE_PRESETS, type AdDatePreset, type AdInsightsRange } from "@/lib/meta";
import { getCmClientAccess } from "@/lib/cm-client-access";
import { buildPerformanceReport } from "@/lib/meta/ad-performance";

export const maxDuration = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function readRange(params: URLSearchParams): AdInsightsRange {
  const since = params.get("since");
  const until = params.get("until");
  if (since && until && YMD.test(since) && YMD.test(until) && since <= until) {
    return { since, until };
  }
  const preset = params.get("range") as AdDatePreset | null;
  if (preset && (AD_DATE_PRESETS as readonly string[]).includes(preset)) return { preset };
  return { preset: "last_30d" };
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  const access = await getCmClientAccess(request, clientId);
  if (!access) return NextResponse.json({ error: "No autorizado para esta empresa" }, { status: 403 });

  try {
    const report = await buildPerformanceReport(access.clientId, readRange(request.nextUrl.searchParams));
    if ("error" in report) {
      return NextResponse.json({ error: report.error, needsConnect: report.needsConnect }, { status: 409 });
    }
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta no respondió" },
      { status: 502 }
    );
  }
}
