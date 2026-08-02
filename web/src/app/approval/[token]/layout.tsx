// Sprint 25 · Layout minimalista para el portal público de aprobación.
// No hereda AppShell (sidebar/header de dashboard); es una experiencia
// tipo Stripe/Linear: clean, un solo objetivo (aprobar/rechazar).

export const metadata = {
  title: "Aprobación de post",
  robots: { index: false, follow: false },
};

export default function ApprovalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
