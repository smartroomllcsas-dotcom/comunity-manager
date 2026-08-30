// Fusión OS (feat/os-unification): el composer canónico vive en /es/os/content
// (PostComposerPro multi-plataforma con data real). Esta ruta legacy redirige
// para mantener una sola implementación sin romper links existentes.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ComposerPage() {
  redirect("/es/os/content");
}
