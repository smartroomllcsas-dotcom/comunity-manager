export const DEFAULT_CAMPAIGNS = [
  {
    id: 'mock-campaign-1',
    name: 'Brand Awareness Q2',
    status: 'ACTIVE',
    objective: 'AWARENESS',
    spend: 128.5,
    impressions: 48210,
    clicks: 1420,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-campaign-2',
    name: 'Lead Generation Sprint',
    status: 'PAUSED',
    objective: 'LEADS',
    spend: 74.2,
    impressions: 18300,
    clicks: 611,
    updatedAt: new Date().toISOString(),
  },
]

export const DEFAULT_INSIGHTS = [
  { name: 'Spend', value: 128.5 },
  { name: 'Impressions', value: 48210 },
  { name: 'Clicks', value: 1420 },
]
