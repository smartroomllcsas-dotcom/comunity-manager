/**
 * Gmail / IMAP connector — zero-dependency TLS reachability probe.
 *
 * Reads config from os_connectors:
 *   config = {
 *     host: 'imap.gmail.com',
 *     port: 993,
 *     username: 'user@gmail.com',
 *     password: wrapSecret('app-password')
 *   }
 *
 * Probe strategy:
 *   1. Validate config shape (host, port, username, password all present).
 *   2. Unwrap password to verify decrypt works (catches bad key rotation).
 *   3. Open TLS socket to host:port with 3s timeout.
 *   4. Read greeting; IMAP servers start with `* OK ...` — treat as `live`.
 *   5. If TCP/TLS fails, return `error`. Auth-level check requires a full
 *      IMAP LOGIN and belongs in a scheduled worker, not the render-path probe.
 */
import { connect } from 'node:tls';
import type { ConnectorAdapter, ProbeResult } from '../base';
import { getSupabaseServiceClient } from '@/lib/os/supabase-service';
import { unwrapSecret } from '@/lib/os/crypto';

async function tlsBannerCheck(host: string, port: number, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, servername: host });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('secureConnect', () => {
      socket.setEncoding('utf8');
    });
    socket.once('data', (chunk: string) => {
      clearTimeout(timer);
      socket.end();
      resolve(chunk.trim());
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
  });
}

export const gmailImapAdapter: ConnectorAdapter = {
  id: 'gmail-imap',
  label: 'Gmail / IMAP',
  kind: 'imap',
  provider: 'gmail-imap',

  async probe(orgId: string): Promise<ProbeResult> {
    try {
      const sb = getSupabaseServiceClient();
      const { data } = await sb
        .from('os_connectors')
        .select('config, status')
        .eq('org_id', orgId)
        .eq('id', 'gmail-imap')
        .maybeSingle();

      const cfg = (data?.config ?? {}) as Record<string, unknown>;
      const host = String(cfg.host ?? '').trim();
      const port = Number(cfg.port ?? 0);
      const username = String(cfg.username ?? '').trim();
      const rawPassword = cfg.password as string | undefined;

      if (!host || !port || !username || !rawPassword) {
        return {
          status: 'not_configured',
          meta: { note: 'Missing host, port, username, or password in os_connectors.config' },
        };
      }

      const password = unwrapSecret(rawPassword);
      if (!password) {
        return {
          status: 'error',
          error: 'Failed to decrypt stored password',
          meta: { note: 'Password decrypt failed — likely key rotation, re-save credentials' },
        };
      }

      const banner = await tlsBannerCheck(host, port);
      if (!banner.startsWith('* OK')) {
        return {
          status: 'error',
          error: `Unexpected IMAP banner: ${banner.slice(0, 80)}`,
          meta: { note: 'Endpoint reachable but does not speak IMAP' },
        };
      }

      return {
        status: 'live',
        meta: {
          host,
          port,
          username,
          bannerSummary: banner.slice(0, 80),
          note: null,
        },
      };
    } catch (e: any) {
      return {
        status: 'error',
        error: e?.message ?? String(e),
        meta: { note: 'IMAP host unreachable — check host/port and firewall' },
      };
    }
  },
};
