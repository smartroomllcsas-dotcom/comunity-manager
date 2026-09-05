/**
 * Notify module entry point.
 *
 * The `/api/reports/route.ts` handler does a dynamic `import("@/lib/notify")`
 * and looks for an optional `sendReportEmail` function. This barrel exports
 * a shim so the module always resolves (avoids build warnings) but returns
 * undefined for the optional API until an owner wires the real sender.
 */

export { notify } from './dispatcher';
export type { NotifyRequest, NotificationChannel } from './dispatcher';
export type { TemplateId } from './templates';

/**
 * Optional: report-email sender. Not implemented yet — kept as `undefined`
 * so that `mod.sendReportEmail` guards in callers fall through cleanly.
 * When wired, replace with a real function:
 *   export async function sendReportEmail(args: {
 *     to: string; publicUrl: string; clientName?: string; branding?: unknown;
 *   }): Promise<void> { ... }
 */
export const sendReportEmail: undefined = undefined;
