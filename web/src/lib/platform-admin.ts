export const GLOBAL_ADMIN_EMAIL = "leonelzc2005@gmail.com";

export function isGlobalAdminEmail(email: string) {
  return email.trim().toLowerCase() === GLOBAL_ADMIN_EMAIL;
}
