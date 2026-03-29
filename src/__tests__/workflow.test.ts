import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../cloudflare-api.js';
import {
  exposeSshService,
  exposeWebService,
  removeService,
  listServices,
} from '../tools/workflow.js';

vi.mock('../cloudflare-api.js');

const TOKEN = 'test-token';
const ACCOUNT_ID = 'acct-123';
const TUNNEL_ID = 'tunnel-abc';
const ZONE_ID = 'zone-xyz';
const ZONE_NAME = 'example.com';
const TUNNEL_CNAME = `${TUNNEL_ID}.cfargotunnel.com`;

const EMPTY_TUNNEL_CONFIG = {
  config: {
    ingress: [{ service: 'http_status:404' }],
  },
};

const EXISTING_TUNNEL_CONFIG = {
  config: {
    ingress: [
      { hostname: 'existing.example.com', service: 'http://192.168.1.5:8080' },
      { service: 'http_status:404' },
    ],
  },
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ── expose_ssh_service ────────────────────────────────────────────────────────

describe('exposeSshService', () => {
  it('calls API functions in correct order with correct params', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeSshService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'homeserver',
      backend_host: '192.168.1.10',
      backend_port: 22,
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
    });

    const hostname = `homeserver.${ZONE_NAME}`;

    // 1. Fetch zone name
    expect(api.getZone).toHaveBeenCalledWith(TOKEN, ZONE_ID);

    // 2. Fetch current tunnel config
    expect(api.getTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID);

    // 3. Push updated tunnel config — new rule before catch-all
    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID, {
      config: {
        ingress: [
          { hostname, service: 'ssh://192.168.1.10:22' },
          { service: 'http_status:404' },
        ],
      },
    });

    // 4. Create CNAME pointing subdomain at tunnel
    expect(api.createDnsRecord).toHaveBeenCalledWith(TOKEN, ZONE_ID, {
      type: 'CNAME',
      name: 'homeserver',
      content: TUNNEL_CNAME,
      proxied: true,
    });

    // 5. Create Access application
    expect(api.createAccessApplication).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, {
      name: hostname,
      domain: hostname,
      type: 'self_hosted',
      session_duration: '24h',
    });

    // 6. Create Access policy with allowed emails
    expect(api.createAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1', {
      name: 'Allow authorized users',
      decision: 'allow',
      include: [{ email: { email: 'user@gmail.com' } }],
    });
  });

  it('inserts new ingress rule before existing rules and catch-all', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EXISTING_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeSshService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'newhost',
      backend_host: '192.168.1.20',
      backend_port: 22,
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
    });

    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID, {
      config: {
        ingress: [
          { hostname: 'existing.example.com', service: 'http://192.168.1.5:8080' },
          { hostname: `newhost.${ZONE_NAME}`, service: 'ssh://192.168.1.20:22' },
          { service: 'http_status:404' },
        ],
      },
    });
  });

  it('includes multiple allowed emails in policy', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeSshService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'homeserver',
      backend_host: '192.168.1.10',
      backend_port: 22,
      allowed_emails: ['alice@gmail.com', 'bob@gmail.com'],
      allow_otp: false,
    });

    expect(api.createAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1', {
      name: 'Allow authorized users',
      decision: 'allow',
      include: [
        { email: { email: 'alice@gmail.com' } },
        { email: { email: 'bob@gmail.com' } },
      ],
    });
  });

  it('adds OTP include rule when allow_otp is true', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeSshService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'homeserver',
      backend_host: '192.168.1.10',
      backend_port: 22,
      allowed_emails: ['user@gmail.com'],
      allow_otp: true,
    });

    expect(api.createAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1', {
      name: 'Allow authorized users',
      decision: 'allow',
      include: [
        { email: { email: 'user@gmail.com' } },
        { auth_method: { auth_method: 'otp' } },
      ],
    });
  });

  it('uses default port 22 if not specified', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeSshService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'homeserver',
      backend_host: '192.168.1.10',
      backend_port: 22,
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
    });

    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID,
      expect.objectContaining({
        config: expect.objectContaining({
          ingress: expect.arrayContaining([
            { hostname: `homeserver.${ZONE_NAME}`, service: 'ssh://192.168.1.10:22' },
          ]),
        }),
      })
    );
  });

  it('throws if Cloudflare API call fails', async () => {
    vi.mocked(api.getZone).mockRejectedValue(new Error('Cloudflare API error'));

    await expect(
      exposeSshService(TOKEN, ACCOUNT_ID, {
        tunnel_id: TUNNEL_ID,
        zone_id: ZONE_ID,
        subdomain: 'homeserver',
        backend_host: '192.168.1.10',
        backend_port: 22,
        allowed_emails: ['user@gmail.com'],
        allow_otp: false,
      })
    ).rejects.toThrow('Cloudflare API error');
  });
});

// ── expose_web_service ────────────────────────────────────────────────────────

describe('exposeWebService', () => {
  it('calls API functions in correct order with correct params', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeWebService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'proxmox',
      backend_host: '192.168.1.100',
      backend_port: 8006,
      backend_protocol: 'https',
      service_name: 'Proxmox',
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
      no_tls_verify: false,
    });

    const hostname = `proxmox.${ZONE_NAME}`;

    expect(api.getZone).toHaveBeenCalledWith(TOKEN, ZONE_ID);
    expect(api.getTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID);

    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID, {
      config: {
        ingress: [
          { hostname, service: 'https://192.168.1.100:8006' },
          { service: 'http_status:404' },
        ],
      },
    });

    expect(api.createDnsRecord).toHaveBeenCalledWith(TOKEN, ZONE_ID, {
      type: 'CNAME',
      name: 'proxmox',
      content: TUNNEL_CNAME,
      proxied: true,
    });

    expect(api.createAccessApplication).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, {
      name: 'Proxmox',
      domain: hostname,
      type: 'self_hosted',
      session_duration: '24h',
    });

    expect(api.createAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1', {
      name: 'Allow authorized users',
      decision: 'allow',
      include: [{ email: { email: 'user@gmail.com' } }],
    });
  });

  it('builds correct service URL for http protocol', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeWebService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'homeassistant',
      backend_host: '192.168.1.50',
      backend_port: 8123,
      backend_protocol: 'http',
      service_name: 'Home Assistant',
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
      no_tls_verify: false,
    });

    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID,
      expect.objectContaining({
        config: expect.objectContaining({
          ingress: expect.arrayContaining([
            { hostname: `homeassistant.${ZONE_NAME}`, service: 'http://192.168.1.50:8123' },
          ]),
        }),
      })
    );
  });

  it('adds OTP include rule when allow_otp is true', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeWebService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'grafana',
      backend_host: '192.168.1.30',
      backend_port: 3000,
      backend_protocol: 'http',
      service_name: 'Grafana',
      allowed_emails: ['user@gmail.com'],
      allow_otp: true,
      no_tls_verify: false,
    });

    expect(api.createAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1',
      expect.objectContaining({
        include: expect.arrayContaining([
          { auth_method: { auth_method: 'otp' } },
        ]),
      })
    );
  });

  it('sets noTLSVerify on ingress rule when no_tls_verify is true', async () => {
    vi.mocked(api.getZone).mockResolvedValue({ name: ZONE_NAME });
    vi.mocked(api.getTunnelConfig).mockResolvedValue(EMPTY_TUNNEL_CONFIG);
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.createDnsRecord).mockResolvedValue({ id: 'dns-1' });
    vi.mocked(api.createAccessApplication).mockResolvedValue({ id: 'app-1' });
    vi.mocked(api.createAccessPolicy).mockResolvedValue({ id: 'policy-1' });

    await exposeWebService(TOKEN, ACCOUNT_ID, {
      tunnel_id: TUNNEL_ID,
      zone_id: ZONE_ID,
      subdomain: 'myservice',
      backend_host: '192.168.1.1',
      backend_port: 443,
      backend_protocol: 'https',
      service_name: 'My Service',
      allowed_emails: ['user@gmail.com'],
      allow_otp: false,
      no_tls_verify: true,
    });

    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID,
      expect.objectContaining({
        config: expect.objectContaining({
          ingress: expect.arrayContaining([
            {
              hostname: `myservice.${ZONE_NAME}`,
              service: 'https://192.168.1.1:443',
              originRequest: { noTLSVerify: true },
            },
          ]),
        }),
      })
    );
  });
});

// ── remove_service ────────────────────────────────────────────────────────────

describe('removeService', () => {
  const HOSTNAME = 'homeserver.example.com';

  it('removes ingress rule, DNS record, Access policy, and Access app', async () => {
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: {
        ingress: [
          { hostname: HOSTNAME, service: 'ssh://192.168.1.10:22' },
          { service: 'http_status:404' },
        ],
      },
    });
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.listDnsRecords).mockResolvedValue([
      { id: 'dns-1', name: HOSTNAME, type: 'CNAME' },
      { id: 'dns-2', name: 'other.example.com', type: 'CNAME' },
    ]);
    vi.mocked(api.deleteDnsRecord).mockResolvedValue({});
    vi.mocked(api.listAccessApplications).mockResolvedValue([
      { id: 'app-1', domain: HOSTNAME, name: 'homeserver.example.com' },
      { id: 'app-2', domain: 'other.example.com', name: 'other' },
    ]);
    vi.mocked(api.listAccessPolicies).mockResolvedValue([
      { id: 'policy-1' },
    ]);
    vi.mocked(api.deleteAccessPolicy).mockResolvedValue({});
    vi.mocked(api.deleteAccessApplication).mockResolvedValue({});

    await removeService(TOKEN, ACCOUNT_ID, { hostname: HOSTNAME, tunnel_id: TUNNEL_ID, zone_id: ZONE_ID });

    // Remove ingress rule, preserve others and catch-all
    expect(api.putTunnelConfig).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, TUNNEL_ID, {
      config: {
        ingress: [{ service: 'http_status:404' }],
      },
    });

    // Delete DNS record
    expect(api.deleteDnsRecord).toHaveBeenCalledWith(TOKEN, ZONE_ID, 'dns-1');

    // Delete Access policy then app
    expect(api.deleteAccessPolicy).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1', 'policy-1');
    expect(api.deleteAccessApplication).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1');
  });

  it('does not delete unrelated DNS records or Access apps', async () => {
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: {
        ingress: [
          { hostname: HOSTNAME, service: 'ssh://192.168.1.10:22' },
          { service: 'http_status:404' },
        ],
      },
    });
    vi.mocked(api.putTunnelConfig).mockResolvedValue({});
    vi.mocked(api.listDnsRecords).mockResolvedValue([
      { id: 'dns-1', name: HOSTNAME, type: 'CNAME' },
      { id: 'dns-2', name: 'other.example.com', type: 'CNAME' },
    ]);
    vi.mocked(api.deleteDnsRecord).mockResolvedValue({});
    vi.mocked(api.listAccessApplications).mockResolvedValue([
      { id: 'app-1', domain: HOSTNAME },
      { id: 'app-2', domain: 'other.example.com' },
    ]);
    vi.mocked(api.listAccessPolicies).mockResolvedValue([]);
    vi.mocked(api.deleteAccessPolicy).mockResolvedValue({});
    vi.mocked(api.deleteAccessApplication).mockResolvedValue({});

    await removeService(TOKEN, ACCOUNT_ID, { hostname: HOSTNAME, tunnel_id: TUNNEL_ID, zone_id: ZONE_ID });

    expect(api.deleteDnsRecord).toHaveBeenCalledTimes(1);
    expect(api.deleteDnsRecord).toHaveBeenCalledWith(TOKEN, ZONE_ID, 'dns-1');
    expect(api.deleteAccessApplication).toHaveBeenCalledTimes(1);
    expect(api.deleteAccessApplication).toHaveBeenCalledWith(TOKEN, ACCOUNT_ID, 'app-1');
  });

  it('throws if no ingress rule found for hostname', async () => {
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: { ingress: [{ service: 'http_status:404' }] },
    });

    await expect(
      removeService(TOKEN, ACCOUNT_ID, { hostname: 'unknown.example.com', tunnel_id: TUNNEL_ID, zone_id: ZONE_ID })
    ).rejects.toThrow(/not found/i);
  });
});

// ── list_services ─────────────────────────────────────────────────────────────

describe('listServices', () => {
  it('returns services joined from tunnel ingress and Access apps', async () => {
    vi.mocked(api.listTunnels).mockResolvedValue([
      { id: TUNNEL_ID, name: 'home-tunnel', status: 'healthy' },
    ]);
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: {
        ingress: [
          { hostname: 'homeserver.example.com', service: 'ssh://192.168.1.10:22' },
          { hostname: 'proxmox.example.com', service: 'https://192.168.1.100:8006' },
          { service: 'http_status:404' },
        ],
      },
    });
    vi.mocked(api.listAccessApplications).mockResolvedValue([
      { id: 'app-1', domain: 'homeserver.example.com', name: 'homeserver.example.com' },
      { id: 'app-2', domain: 'proxmox.example.com', name: 'Proxmox' },
    ]);

    const result = await listServices(TOKEN, ACCOUNT_ID);

    expect(result).toEqual([
      {
        hostname: 'homeserver.example.com',
        service: 'ssh://192.168.1.10:22',
        tunnel_id: TUNNEL_ID,
        tunnel_name: 'home-tunnel',
        access_app_id: 'app-1',
        access_app_name: 'homeserver.example.com',
      },
      {
        hostname: 'proxmox.example.com',
        service: 'https://192.168.1.100:8006',
        tunnel_id: TUNNEL_ID,
        tunnel_name: 'home-tunnel',
        access_app_id: 'app-2',
        access_app_name: 'Proxmox',
      },
    ]);
  });

  it('excludes catch-all ingress rules (no hostname) from results', async () => {
    vi.mocked(api.listTunnels).mockResolvedValue([
      { id: TUNNEL_ID, name: 'home-tunnel', status: 'healthy' },
    ]);
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: {
        ingress: [{ service: 'http_status:404' }],
      },
    });
    vi.mocked(api.listAccessApplications).mockResolvedValue([]);

    const result = await listServices(TOKEN, ACCOUNT_ID);

    expect(result).toEqual([]);
  });

  it('marks service as missing Access app when none matches the hostname', async () => {
    vi.mocked(api.listTunnels).mockResolvedValue([
      { id: TUNNEL_ID, name: 'home-tunnel', status: 'healthy' },
    ]);
    vi.mocked(api.getTunnelConfig).mockResolvedValue({
      config: {
        ingress: [
          { hostname: 'homeserver.example.com', service: 'ssh://192.168.1.10:22' },
          { service: 'http_status:404' },
        ],
      },
    });
    vi.mocked(api.listAccessApplications).mockResolvedValue([]);

    const result = await listServices(TOKEN, ACCOUNT_ID);

    expect(result).toEqual([
      {
        hostname: 'homeserver.example.com',
        service: 'ssh://192.168.1.10:22',
        tunnel_id: TUNNEL_ID,
        tunnel_name: 'home-tunnel',
        access_app_id: null,
        access_app_name: null,
      },
    ]);
  });

  it('aggregates services across multiple tunnels', async () => {
    vi.mocked(api.listTunnels).mockResolvedValue([
      { id: 'tunnel-1', name: 'home-tunnel', status: 'healthy' },
      { id: 'tunnel-2', name: 'office-tunnel', status: 'healthy' },
    ]);
    vi.mocked(api.getTunnelConfig)
      .mockResolvedValueOnce({
        config: {
          ingress: [
            { hostname: 'homeserver.example.com', service: 'ssh://192.168.1.10:22' },
            { service: 'http_status:404' },
          ],
        },
      })
      .mockResolvedValueOnce({
        config: {
          ingress: [
            { hostname: 'office.example.com', service: 'http://10.0.0.5:80' },
            { service: 'http_status:404' },
          ],
        },
      });
    vi.mocked(api.listAccessApplications).mockResolvedValue([]);

    const result = await listServices(TOKEN, ACCOUNT_ID);

    expect(result).toHaveLength(2);
    expect(result[0].tunnel_id).toBe('tunnel-1');
    expect(result[1].tunnel_id).toBe('tunnel-2');
  });
});
