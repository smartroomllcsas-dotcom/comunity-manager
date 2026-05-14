import { redirect } from "next/navigation";

// Login unificado: /st/login fue absorbido por /login (bridge cm_users <-> auth.users).
// Mantenemos este redirect para no romper bookmarks/links existentes.
export default function StLoginRedirect() {
  redirect("/login");
}
