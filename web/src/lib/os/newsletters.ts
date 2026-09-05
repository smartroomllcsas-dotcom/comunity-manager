// Minimal Newsletter type for Community Manager OS (ported from FounderOS).
// Sprint 2 wires this to a real newsletter connector (Beehiiv / cm_newsletters).

export type Newsletter = {
  id: string;
  title: string;
  publishedAt: string;
  webUrl: string | null;
  recipients: number;
  delivered: number;
  deliveryRate: number;
  opens: number;
  openRate: number;
  clicks: number;
  clickRate: number;
  unsubscribes: number;
  unsubscribeRate: number;
  spamReports: number;
  webViews: number;
};
