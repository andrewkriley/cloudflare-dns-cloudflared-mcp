/**
 * Thin wrapper around the Cloudflare REST API v4.
 * All methods accept a token and optional account/zone identifiers.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

export interface CfEnv {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
}

async function cfFetch(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const json = (await res.json()) as { success: boolean; errors: unknown[]; result: unknown };
  if (!json.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

// ── DNS ──────────────────────────────────────────────────────────────────────

export async function listZones(token: string): Promise<unknown> {
  return cfFetch(token, "/zones?per_page=50");
}

export async function listDnsRecords(token: string, zoneId: string): Promise<unknown> {
  return cfFetch(token, `/zones/${zoneId}/dns_records?per_page=100`);
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  body: {
    type: string;
    name: string;
    content: string;
    ttl?: number;
    proxied?: boolean;
    comment?: string;
  }
): Promise<unknown> {
  return cfFetch(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  body: {
    type?: string;
    name?: string;
    content?: string;
    ttl?: number;
    proxied?: boolean;
    comment?: string;
  }
): Promise<unknown> {
  return cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteDnsRecord(
  token: string,
  zoneId: string,
  recordId: string
): Promise<unknown> {
  return cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

// ── Zones ─────────────────────────────────────────────────────────────────────

export async function getZone(token: string, zoneId: string): Promise<unknown> {
  return cfFetch(token, `/zones/${zoneId}`);
}

// ── Zero Trust — Access ───────────────────────────────────────────────────────

export async function listAccessApplications(
  token: string,
  accountId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps?per_page=50`);
}

export async function createAccessApplication(
  token: string,
  accountId: string,
  body: {
    name: string;
    domain: string;
    type?: string;
    session_duration?: string;
    allowed_idps?: string[];
    auto_redirect_to_identity?: boolean;
  }
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteAccessApplication(
  token: string,
  accountId: string,
  appId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps/${appId}`, {
    method: "DELETE",
  });
}

export async function listAccessPolicies(
  token: string,
  accountId: string,
  appId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies`);
}

export async function createAccessPolicy(
  token: string,
  accountId: string,
  appId: string,
  body: {
    name: string;
    decision: string;
    include: unknown[];
  }
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteAccessPolicy(
  token: string,
  accountId: string,
  appId: string,
  policyId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/access/apps/${appId}/policies/${policyId}`, {
    method: "DELETE",
  });
}

// ── Tunnel config ─────────────────────────────────────────────────────────────

export async function getTunnelConfig(
  token: string,
  accountId: string,
  tunnelId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`);
}

export async function putTunnelConfig(
  token: string,
  accountId: string,
  tunnelId: string,
  body: unknown
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getOrCreateAccessSshCa(
  token: string,
  accountId: string
): Promise<unknown> {
  try {
    return await cfFetch(token, `/accounts/${accountId}/access/gateway_ca`);
  } catch {
    // CA doesn't exist yet — create it
    return cfFetch(token, `/accounts/${accountId}/access/gateway_ca`, { method: "POST" });
  }
}

// ── Tunnels ───────────────────────────────────────────────────────────────────

export async function listTunnels(
  token: string,
  accountId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel?per_page=50`);
}

export async function getTunnel(
  token: string,
  accountId: string,
  tunnelId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}`);
}

export async function getTunnelToken(
  token: string,
  accountId: string,
  tunnelId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`);
}

export async function listTunnelConnections(
  token: string,
  accountId: string,
  tunnelId: string
): Promise<unknown> {
  return cfFetch(token, `/accounts/${accountId}/cfd_tunnel/${tunnelId}/connections`);
}
