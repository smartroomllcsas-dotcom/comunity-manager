import { getRequestConfig } from 'next-intl/server';

export const locales = ['es', 'en'] as const;
export const defaultLocale = 'es';
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? defaultLocale;
  if (!locales.includes(locale as Locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
