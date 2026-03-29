/**
 * Integration tests for workflow tools against real Cloudflare API.
 *
 * Required environment variables (set by CI workflow):
 *   CF_API_TOKEN_CI   — Cloudflare API token with Tunnel + Zero Trust + DNS Edit
 *   CF_ACCOUNT_ID     — Cloudflare account ID
 *   CI_TUNNEL_ID      — ID of the ephemeral tunnel created by the CI workflow
 *   CF_TEST_ZONE_ID   — Zone ID to create test DNS records in
 *   GITHUB_RUN_ID     — Used for unique resource naming (defaults to 'local')
 *
 * All tests are skipped if any required variable is absent, so
 * `npm test` (unit tests) is unaffected locally.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  exposeSshService,
  exposeWebService,
  removeService,
  listServices,
} from '../../tools/workflow.js';
import {
  getTunnelConfig,
  listDnsRecords,
  listAccessApplications,
} from '../../cloudflare-api.js';

const TOKEN     = process.env.CF_API_TOKEN_CI   ?? '';
const ACCOUNT   = process.env.CF_ACCOUNT_ID     ?? '';
const TUNNEL_ID = process.env.CI_TUNNEL_ID      ?? '';
const ZONE_ID   = process.env.CF_TEST_ZONE_ID   ?? '';
const RUN_ID    = process.env.GITHUB_RUN_ID     ?? 'local';

const allVarsPresent = TOKEN && ACCOUNT && TUNNEL_ID && ZONE_ID;

const SSH_SUBDOMAIN = `ci-${RUN_ID}-ssh`;
const WEB_SUBDOMAIN = `ci-${RUN_ID}-web`;

// Resolved at runtime from the zone
let zoneName = '';
let sshHostname = '';
let webHostname = '';

// Track what was created so afterAll can clean up anything left behind
const created = { ssh: false, web: false };

describe.skipIf(!allVarsPresent)('integration: workflow tools', () => {

  beforeAll(async () => {
    // Resolve zone name from zone ID to build full hostnames
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const json = await res.json() as { result: { name: string } };
    zoneName    = json.result.name;
    sshHostname = `${SSH_SUBDOMAIN}.${zoneName}`;
    webHostname = `${WEB_SUBDOMAIN}.${zoneName}`;
  });

  afterAll(async () => {
    // Best-effort cleanup — remove any services still present after tests
    const cleanupAttempts: Promise<unknown>[] = [];

    if (created.ssh) {
      cleanupAttempts.push(
        removeService(TOKEN, ACCOUNT, {
          hostname: sshHostname,
          tunnel_id: TUNNEL_ID,
          zone_id: ZONE_ID,
        }).catch(() => { /* already removed or never created */ })
      );
    }

    if (created.web) {
      cleanupAttempts.push(
        removeService(TOKEN, ACCOUNT, {
          hostname: webHostname,
          tunnel_id: TUNNEL_ID,
          zone_id: ZONE_ID,
        }).catch(() => { /* already removed or never created */ })
      );
    }

    await Promise.all(cleanupAttempts);
  });

  // ── expose_ssh_service ──────────────────────────────────────────────────────

  describe('expose_ssh_service', () => {
    it('creates tunnel ingress rule, DNS CNAME, Access app, and policy', async () => {
      await exposeSshService(TOKEN, ACCOUNT, {
        tunnel_id:      TUNNEL_ID,
        zone_id:        ZONE_ID,
        subdomain:      SSH_SUBDOMAIN,
        backend_host:   '192.168.1.10',
        backend_port:   22,
        allowed_emails: ['ci-test@example.com'],
        allow_otp:      false,
      });
      created.ssh = true;

      // Verify tunnel ingress rule exists
      const config = await getTunnelConfig(TOKEN, ACCOUNT, TUNNEL_ID) as {
        config: { ingress: { hostname?: string; service: string }[] };
      };
      const ingressRule = config.config.ingress.find(r => r.hostname === sshHostname);
      expect(ingressRule).toBeDefined();
      expect(ingressRule?.service).toBe('ssh://192.168.1.10:22');

      // Verify DNS CNAME exists
      const dnsRecords = await listDnsRecords(TOKEN, ZONE_ID) as {
        id: string; name: string; type: string; content: string;
      }[];
      const cname = dnsRecords.find(r => r.name === sshHostname && r.type === 'CNAME');
      expect(cname).toBeDefined();
      expect(cname?.content).toBe(`${TUNNEL_ID}.cfargotunnel.com`);

      // Verify Access app exists
      const apps = await listAccessApplications(TOKEN, ACCOUNT) as {
        id: string; domain: string;
      }[];
      const app = apps.find(a => a.domain === sshHostname);
      expect(app).toBeDefined();
    });
  });

  // ── expose_web_service ──────────────────────────────────────────────────────

  describe('expose_web_service', () => {
    it('creates tunnel ingress rule, DNS CNAME, Access app, and policy', async () => {
      await exposeWebService(TOKEN, ACCOUNT, {
        tunnel_id:        TUNNEL_ID,
        zone_id:          ZONE_ID,
        subdomain:        WEB_SUBDOMAIN,
        backend_host:     '192.168.1.100',
        backend_port:     8006,
        backend_protocol: 'https',
        service_name:     'CI Test Web',
        allowed_emails:   ['ci-test@example.com'],
        allow_otp:        false,
      });
      created.web = true;

      // Verify tunnel ingress rule
      const config = await getTunnelConfig(TOKEN, ACCOUNT, TUNNEL_ID) as {
        config: { ingress: { hostname?: string; service: string }[] };
      };
      const ingressRule = config.config.ingress.find(r => r.hostname === webHostname);
      expect(ingressRule).toBeDefined();
      expect(ingressRule?.service).toBe('https://192.168.1.100:8006');

      // Verify DNS CNAME
      const dnsRecords = await listDnsRecords(TOKEN, ZONE_ID) as {
        id: string; name: string; type: string; content: string;
      }[];
      const cname = dnsRecords.find(r => r.name === webHostname && r.type === 'CNAME');
      expect(cname).toBeDefined();

      // Verify Access app
      const apps = await listAccessApplications(TOKEN, ACCOUNT) as {
        id: string; domain: string; name: string;
      }[];
      const app = apps.find(a => a.domain === webHostname);
      expect(app).toBeDefined();
      expect(app?.name).toBe('CI Test Web');
    });
  });

  // ── list_services ───────────────────────────────────────────────────────────

  describe('list_services', () => {
    it('includes both exposed services with correct details', async () => {
      const services = await listServices(TOKEN, ACCOUNT);

      const sshService = services.find(s => s.hostname === sshHostname);
      expect(sshService).toBeDefined();
      expect(sshService?.service).toBe('ssh://192.168.1.10:22');
      expect(sshService?.tunnel_id).toBe(TUNNEL_ID);
      expect(sshService?.access_app_id).not.toBeNull();

      const webService = services.find(s => s.hostname === webHostname);
      expect(webService).toBeDefined();
      expect(webService?.service).toBe('https://192.168.1.100:8006');
      expect(webService?.tunnel_id).toBe(TUNNEL_ID);
      expect(webService?.access_app_id).not.toBeNull();
    });
  });

  // ── remove_service ──────────────────────────────────────────────────────────

  describe('remove_service', () => {
    it('removes SSH service — ingress rule, DNS record, and Access app all gone', async () => {
      await removeService(TOKEN, ACCOUNT, {
        hostname:  sshHostname,
        tunnel_id: TUNNEL_ID,
        zone_id:   ZONE_ID,
      });
      created.ssh = false;

      const config = await getTunnelConfig(TOKEN, ACCOUNT, TUNNEL_ID) as {
        config: { ingress: { hostname?: string }[] };
      };
      expect(config.config.ingress.find(r => r.hostname === sshHostname)).toBeUndefined();

      const dnsRecords = await listDnsRecords(TOKEN, ZONE_ID) as { name: string }[];
      expect(dnsRecords.find(r => r.name === sshHostname)).toBeUndefined();

      const apps = await listAccessApplications(TOKEN, ACCOUNT) as { domain: string }[];
      expect(apps.find(a => a.domain === sshHostname)).toBeUndefined();
    });

    it('removes web service — ingress rule, DNS record, and Access app all gone', async () => {
      await removeService(TOKEN, ACCOUNT, {
        hostname:  webHostname,
        tunnel_id: TUNNEL_ID,
        zone_id:   ZONE_ID,
      });
      created.web = false;

      const config = await getTunnelConfig(TOKEN, ACCOUNT, TUNNEL_ID) as {
        config: { ingress: { hostname?: string }[] };
      };
      expect(config.config.ingress.find(r => r.hostname === webHostname)).toBeUndefined();

      const dnsRecords = await listDnsRecords(TOKEN, ZONE_ID) as { name: string }[];
      expect(dnsRecords.find(r => r.name === webHostname)).toBeUndefined();

      const apps = await listAccessApplications(TOKEN, ACCOUNT) as { domain: string }[];
      expect(apps.find(a => a.domain === webHostname)).toBeUndefined();
    });

    it('list_services no longer shows removed services', async () => {
      const services = await listServices(TOKEN, ACCOUNT);
      expect(services.find(s => s.hostname === sshHostname)).toBeUndefined();
      expect(services.find(s => s.hostname === webHostname)).toBeUndefined();
    });
  });
});
