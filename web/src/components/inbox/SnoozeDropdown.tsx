"use client";
import { useState, useRef, useEffect } from "react";
import { Clock, X, Calendar } from "lucide-react";
import { addHours, nextMonday, setHours, setMinutes, setSeconds, startOfTomorrow } from "date-fns";

interface SnoozeDropdownProps {
  conversationId: string;
  isSnoozed: boolean;
  onSnooze: (snoozedUntil: string) => Promise<void>;
  onUnsnooze: () => Promise<void>;
}

export function SnoozeDropdown({ conversationId, isSnoozed, onSnooze, onUnsnooze }: SnoozeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleSnooze(date: Date) {
    await onSnooze(date.toISOString());
    setOpen(false);
    setShowCustom(false);
  }

  async function handleCustomSubmit() {
    if (!customDate || !customTime) return;
    const [hours, minutes] = customTime.split(":").map(Number);
    const date = setSeconds(setMinutes(setHours(new Date(customDate + "T00:00:00"), hours), minutes), 0);
    await handleSnooze(date);
  }

  const snoozeOptions = [
    {
      label: "1 hora",
      getDate: () => addHours(new Date(), 1),
    },
    {
      label: "3 horas",
      getDate: () => addHours(new Date(), 3),
    },
    {
      label: "Manana 9:00 AM",
      getDate: () => setHours(setMinutes(setSeconds(startOfTomorrow(), 0), 0), 9),
    },
    {
      label: "Proxima semana Lunes 9:00 AM",
      getDate: () => setHours(setMinutes(setSeconds(nextMonday(new Date()), 0), 0), 9),
    },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          if (isSnoozed) {
            onUnsnooze();
          } else {
            setOpen(!open);
          }
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
          isSnoozed
            ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
            : "text-[#8b949e] hover:bg-[#1a1f2e]"
        }`}
        title={isSnoozed ? "Quitar snooze" : "Posponer"}
      >
        {isSnoozed ? <X className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
        {isSnoozed ? "Desactivar" : "Posponer"}
      </button>

      {open && !isSnoozed && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#1a1f2e] border border-[#2d333b] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2d333b]">
            <p className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">
              Posponer hasta
            </p>
          </div>

          {!showCustom ? (
            <div className="py-1">
              {snoozeOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleSnooze(opt.getDate())}
                  className="w-full text-left px-3 py-2 text-[12px] text-[#c9d1d9] hover:bg-[#2d333b] transition-colors flex items-center gap-2"
                >
                  <Clock className="h-3 w-3 text-blue-400" />
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustom(true)}
                className="w-full text-left px-3 py-2 text-[12px] text-[#c9d1d9] hover:bg-[#2d333b] transition-colors flex items-center gap-2 border-t border-[#2d333b]"
              >
                <Calendar className="h-3 w-3 text-blue-400" />
                Personalizado
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full h-8 rounded-md bg-[#0d1117] border border-[#2d333b] text-xs text-[#c9d1d9] px-2 focus:outline-none focus:border-[#388bfd] transition-colors"
              />
              <input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-full h-8 rounded-md bg-[#0d1117] border border-[#2d333b] text-xs text-[#c9d1d9] px-2 focus:outline-none focus:border-[#388bfd] transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-medium text-[#8b949e] hover:bg-[#2d333b] transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customDate}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-30 transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
