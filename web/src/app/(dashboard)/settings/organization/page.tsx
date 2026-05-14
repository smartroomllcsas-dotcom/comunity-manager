"use client";
import { useState, useEffect } from "react";
import { useCurrentAgent } from "@/hooks/useCurrentAgent";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Building2, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import type { Organization } from "@/types/database";

export const dynamic = "force-dynamic";

const DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miercoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sabado" },
  { key: "sunday", label: "Domingo" },
];

const TIMEZONES = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

const LANGUAGES = [
  { value: "es", label: "Espanol" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portugues" },
];

type DaySchedule = { open: string; close: string; enabled: boolean };
type Schedule = Record<string, DaySchedule>;

const DEFAULT_SCHEDULE: Schedule = {
  monday: { open: "09:00", close: "18:00", enabled: true },
  tuesday: { open: "09:00", close: "18:00", enabled: true },
  wednesday: { open: "09:00", close: "18:00", enabled: true },
  thursday: { open: "09:00", close: "18:00", enabled: true },
  friday: { open: "09:00", close: "18:00", enabled: true },
  saturday: { open: "09:00", close: "14:00", enabled: false },
  sunday: { open: "09:00", close: "14:00", enabled: false },
};

export default function OrganizationSettingsPage() {
  const { data: currentAgent } = useCurrentAgent();
  const supabase = createClient();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [language, setLanguage] = useState("es");

  useEffect(() => {
    if (!currentAgent?.organization_id) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", currentAgent!.organization_id)
        .single();
      if (data) {
        setOrg(data as Organization);
        setName(data.name || "");
        if (data.business_hours) {
          const bh = data.business_hours as { timezone?: string; schedule?: Schedule };
          if (bh.timezone) setTimezone(bh.timezone);
          if (bh.schedule) setSchedule({ ...DEFAULT_SCHEDULE, ...bh.schedule });
        }
      }
      setLoading(false);
    }
    load();
  }, [currentAgent?.organization_id]);

  function updateDay(day: string, field: keyof DaySchedule, value: string | boolean) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSave() {
    if (!org) return;
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name,
          business_hours: { timezone, schedule },
        })
        .eq("id", org.id);
      if (!error) setSaved(true);
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "ORG";

  if (loading) {
    return (
      <div className="min-h-full bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-[#8b949e]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0d1117]">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2d333b] bg-[#161b22]">
        <Link href="/settings" className="text-[#8b949e] hover:text-white transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Configuración de la Organización</h1>
          <p className="text-xs text-[#8b949e] mt-0.5">Nombre, logo, horario comercial y preferencias generales</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
        </Button>
      </div>

      <div className="p-6 max-w-3xl space-y-6">
        {/* Organization Identity */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#8b949e]" />
            Identidad
          </h2>
          <div className="flex items-start gap-5">
            {/* Logo placeholder */}
            <div className="h-16 w-16 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-[#8b949e]">Nombre de la organización</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[#0d1117] border-[#2d333b] text-white placeholder:text-[#8b949e] h-9"
                  placeholder="Mi Empresa S.A."
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#8b949e]">ID de organización</Label>
                <Input
                  value={org?.id || ""}
                  readOnly
                  className="bg-[#0d1117] border-[#2d333b] text-[#8b949e] h-9 font-mono text-xs cursor-default"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Idioma predeterminado</h2>
          <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
            <SelectTrigger className="w-48 bg-[#0d1117] border-[#2d333b] text-white h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Business Hours */}
        <div className="bg-[#1a1f2e] border border-[#2d333b] rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Horario comercial</h2>

          <div className="mb-4">
            <Label className="text-xs text-[#8b949e] mb-1.5 block">Zona horaria</Label>
            <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
              <SelectTrigger className="w-64 bg-[#0d1117] border-[#2d333b] text-white h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1f2e] border-[#2d333b]">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const day = schedule[key];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-4 p-3 rounded-lg border ${
                    day.enabled
                      ? "bg-[#0d1117] border-[#2d333b]"
                      : "bg-[#0d1117]/50 border-[#2d333b]/50"
                  }`}
                >
                  <Switch
                    checked={day.enabled}
                    onCheckedChange={(checked) => updateDay(key, "enabled", checked)}
                  />
                  <span
                    className={`text-sm w-24 ${day.enabled ? "text-white" : "text-[#8b949e]"}`}
                  >
                    {label}
                  </span>
                  {day.enabled ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={day.open}
                        onChange={(e) => updateDay(key, "open", e.target.value)}
                        className="bg-[#161b22] border-[#2d333b] text-white h-8 w-28 text-xs"
                      />
                      <span className="text-[#8b949e] text-xs">a</span>
                      <Input
                        type="time"
                        value={day.close}
                        onChange={(e) => updateDay(key, "close", e.target.value)}
                        className="bg-[#161b22] border-[#2d333b] text-white h-8 w-28 text-xs"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[#8b949e]">Cerrado</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
