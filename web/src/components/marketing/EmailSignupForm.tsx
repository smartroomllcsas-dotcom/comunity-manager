"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

export function EmailSignupForm() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sent" | "error">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setState("error");
      return;
    }
    // Sin backend en este sprint — redirect a /register con email prellenado.
    if (typeof window !== "undefined") {
      window.location.href = `/register?email=${encodeURIComponent(email)}`;
    }
    setState("sent");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-md flex-col gap-2 sm:flex-row"
    >
      <input
        type="email"
        required
        placeholder="tu@agencia.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setState("idle");
        }}
        className="flex-1 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm text-white placeholder:text-white/50 focus:border-[#f7c65f] focus:outline-none"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f7c65f] px-6 py-3 text-sm font-bold text-[#3b2b08] transition-transform hover:-translate-y-0.5 hover:bg-[#ffda85]"
      >
        Empezar
        <ArrowRight className="h-4 w-4" />
      </button>
      {state === "error" && (
        <p className="mt-2 w-full text-center text-xs text-[#f7c65f]">
          Ingresa un email válido
        </p>
      )}
    </form>
  );
}
