"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const avatarColors = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-purple-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-pink-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

interface ContactAvatarProps {
  name: string;
  photoUrl?: string | null;
  className?: string;
  initialsClassName?: string;
}

export function ContactAvatar({
  name,
  photoUrl,
  className,
  initialsClassName,
}: ContactAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(name || "Desconocido");

  return (
    <div className={cn("relative overflow-hidden flex items-center justify-center text-white font-semibold", getAvatarColor(name || "Desconocido"), className)}>
      {photoUrl && !imageError ? (
        <img
          src={photoUrl}
          alt={name || "Contacto"}
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className={cn("relative z-10", initialsClassName)}>{initials}</span>
      )}
    </div>
  );
}
