// Sprint 26 · Agente S · Layout minimalista para el portal público de onboarding.
// No hereda AppShell del dashboard; experiencia clean estilo Stripe/Linear.

export const metadata = {
  title: "Completa tu onboarding",
  robots: { index: false, follow: false },
};

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
