import {
  getZone,
  getTunnelConfig,
  putTunnelConfig,
  createDnsRecord,
  listDnsRecords,
  deleteDnsRecord,
  createAccessApplication,
  deleteAccessApplication,
  listAccessApplications,
  listAccessPolicies,
  createAccessPolicy,
  deleteAccessPolicy,
  listTunnels,
} from "../cloudflare-api.js";

interface IngressRule {
  hostname?: string;
  service: string;
  originRequest?: { noTLSVerify: boolean };
}

interface TunnelConfig {
  config: {
    ingress: IngressRule[];
  };
}

interface AccessApp {
  id: string;
  domain: string;
  name: string;
}

interface AccessPolicy {
  id: string;
}

interface DnsRecord {
  id: string;
  name: string;
  type: string;
}

interface Tunnel {
  id: string;
  name: string;
  status: string;
}

function buildPolicyInclude(
  allowedEmails: string[],
  allowOtp: boolean
): unknown[] {
  const include: unknown[] = allowedEmails.map((email) => ({
    email: { email },
  }));
  if (allowOtp) {
    include.push({ auth_method: { auth_method: "otp" } });
  }
  return include;
}

function insertIngressRule(
  config: TunnelConfig,
  rule: IngressRule
): TunnelConfig {
  const ingress = config.config.ingress;
  const catchAll = ingress[ingress.length - 1];
  const existing = ingress.slice(0, -1);
  return {
    config: {
      ingress: [...existing, rule, catchAll],
    },
  };
}

function removeIngressRule(
  config: TunnelConfig,
  hostname: string
): TunnelConfig {
  return {
    config: {
      ingress: config.config.ingress.filter((r) => r.hostname !== hostname),
    },
  };
}

// ── expose_ssh_service ────────────────────────────────────────────────────────

export interface ExposeSshParams {
  tunnel_id: string;
  zone_id: string;
  subdomain: string;
  backend_host: string;
  backend_port: number;
  allowed_emails: string[];
  allow_otp: boolean;
}

export async function exposeSshService(
  token: string,
  accountId: string,
  params: ExposeSshParams
): Promise<unknown> {
  const { tunnel_id, zone_id, subdomain, backend_host, backend_port, allowed_emails, allow_otp } = params;

  const zone = (await getZone(token, zone_id)) as { name: string };
  const hostname = `${subdomain}.${zone.name}`;

  const currentConfig = (await getTunnelConfig(token, accountId, tunnel_id)) as TunnelConfig;
  const updatedConfig = insertIngressRule(currentConfig, {
    hostname,
    service: `ssh://${backend_host}:${backend_port}`,
  });
  await putTunnelConfig(token, accountId, tunnel_id, updatedConfig);

  await createDnsRecord(token, zone_id, {
    type: "CNAME",
    name: subdomain,
    content: `${tunnel_id}.cfargotunnel.com`,
    proxied: true,
  });

  const app = (await createAccessApplication(token, accountId, {
    name: hostname,
    domain: hostname,
    type: "self_hosted",
    session_duration: "24h",
  })) as { id: string };

  await createAccessPolicy(token, accountId, app.id, {
    name: "Allow authorized users",
    decision: "allow",
    include: buildPolicyInclude(allowed_emails, allow_otp),
  });

  return { hostname, app_id: app.id };
}

// ── expose_web_service ────────────────────────────────────────────────────────

export interface ExposeWebParams {
  tunnel_id: string;
  zone_id: string;
  subdomain: string;
  backend_host: string;
  backend_port: number;
  backend_protocol: "http" | "https";
  service_name: string;
  allowed_emails: string[];
  allow_otp: boolean;
  no_tls_verify: boolean;
}

export async function exposeWebService(
  token: string,
  accountId: string,
  params: ExposeWebParams
): Promise<unknown> {
  const { tunnel_id, zone_id, subdomain, backend_host, backend_port, backend_protocol, service_name, allowed_emails, allow_otp, no_tls_verify } = params;

  const zone = (await getZone(token, zone_id)) as { name: string };
  const hostname = `${subdomain}.${zone.name}`;

  const currentConfig = (await getTunnelConfig(token, accountId, tunnel_id)) as TunnelConfig;
  const ingressRule: IngressRule = {
    hostname,
    service: `${backend_protocol}://${backend_host}:${backend_port}`,
    ...(no_tls_verify && { originRequest: { noTLSVerify: true } }),
  };
  const updatedConfig = insertIngressRule(currentConfig, ingressRule);
  await putTunnelConfig(token, accountId, tunnel_id, updatedConfig);

  await createDnsRecord(token, zone_id, {
    type: "CNAME",
    name: subdomain,
    content: `${tunnel_id}.cfargotunnel.com`,
    proxied: true,
  });

  const app = (await createAccessApplication(token, accountId, {
    name: service_name,
    domain: hostname,
    type: "self_hosted",
    session_duration: "24h",
  })) as { id: string };

  await createAccessPolicy(token, accountId, app.id, {
    name: "Allow authorized users",
    decision: "allow",
    include: buildPolicyInclude(allowed_emails, allow_otp),
  });

  return { hostname, app_id: app.id };
}

// ── remove_service ────────────────────────────────────────────────────────────

export interface RemoveServiceParams {
  hostname: string;
  tunnel_id: string;
  zone_id: string;
}

export async function removeService(
  token: string,
  accountId: string,
  params: RemoveServiceParams
): Promise<unknown> {
  const { hostname, tunnel_id, zone_id } = params;

  const currentConfig = (await getTunnelConfig(token, accountId, tunnel_id)) as TunnelConfig;
  const ruleExists = currentConfig.config.ingress.some((r) => r.hostname === hostname);
  if (!ruleExists) {
    throw new Error(`Ingress rule for ${hostname} not found in tunnel ${tunnel_id}`);
  }
  const updatedConfig = removeIngressRule(currentConfig, hostname);
  await putTunnelConfig(token, accountId, tunnel_id, updatedConfig);

  const dnsRecords = (await listDnsRecords(token, zone_id)) as DnsRecord[];
  const dnsRecord = dnsRecords.find((r) => r.name === hostname);
  if (dnsRecord) {
    await deleteDnsRecord(token, zone_id, dnsRecord.id);
  }

  const apps = (await listAccessApplications(token, accountId)) as AccessApp[];
  const app = apps.find((a) => a.domain === hostname);
  if (app) {
    const policies = (await listAccessPolicies(token, accountId, app.id)) as AccessPolicy[];
    for (const policy of policies) {
      await deleteAccessPolicy(token, accountId, app.id, policy.id);
    }
    await deleteAccessApplication(token, accountId, app.id);
  }

  return { removed: hostname };
}

// ── list_services ─────────────────────────────────────────────────────────────

export interface ServiceEntry {
  hostname: string;
  service: string;
  tunnel_id: string;
  tunnel_name: string;
  access_app_id: string | null;
  access_app_name: string | null;
}

export async function listServices(
  token: string,
  accountId: string
): Promise<ServiceEntry[]> {
  const tunnels = (await listTunnels(token, accountId)) as Tunnel[];
  const apps = (await listAccessApplications(token, accountId)) as AccessApp[];

  const services: ServiceEntry[] = [];

  for (const tunnel of tunnels) {
    const config = (await getTunnelConfig(token, accountId, tunnel.id)) as TunnelConfig;
    const namedRules = config.config.ingress.filter((r) => r.hostname !== undefined);

    for (const rule of namedRules) {
      const matchingApp = apps.find((a) => a.domain === rule.hostname) ?? null;
      services.push({
        hostname: rule.hostname!,
        service: rule.service,
        tunnel_id: tunnel.id,
        tunnel_name: tunnel.name,
        access_app_id: matchingApp?.id ?? null,
        access_app_name: matchingApp?.name ?? null,
      });
    }
  }

  return services;
}
