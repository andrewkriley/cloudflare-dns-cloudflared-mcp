import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listZones,
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  listAccessApplications,
  createAccessApplication,
  deleteAccessApplication,
  listAccessPolicies,
  listGatewayRules,
  createGatewayRule,
  deleteGatewayRule,
  listGatewayLists,
  listTunnels,
  getTunnel,
  getTunnelToken,
  listTunnelConnections,
} from "./cloudflare-api.js";

function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function createServer(token: string, accountId: string): McpServer {
  const server = new McpServer({ name: "cloudflare-admin", version: "2.0.0" });

  // ── DNS ───────────────────────────────────────────────────────────────────

  server.tool(
    "dns_list_zones",
    "List all DNS zones in the Cloudflare account",
    {},
    async () => ok(await listZones(token))
  );

  server.tool(
    "dns_list_records",
    "List all DNS records for a zone",
    { zone_id: z.string().describe("Zone ID from dns_list_zones") },
    async ({ zone_id }) => ok(await listDnsRecords(token, zone_id))
  );

  server.tool(
    "dns_create_record",
    "Create a new DNS record",
    {
      zone_id: z.string().describe("Zone ID"),
      type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"]),
      name: z.string().describe("Record name, e.g. sub.example.com"),
      content: z.string().describe("Record value"),
      ttl: z.number().int().min(1).optional().describe("TTL in seconds, 1 = auto"),
      proxied: z.boolean().optional().describe("Proxy through Cloudflare"),
      comment: z.string().optional().describe("Optional note"),
    },
    async ({ zone_id, ...body }) => ok(await createDnsRecord(token, zone_id, body))
  );

  server.tool(
    "dns_update_record",
    "Update an existing DNS record",
    {
      zone_id: z.string(),
      record_id: z.string().describe("Record ID from dns_list_records"),
      type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"]).optional(),
      name: z.string().optional(),
      content: z.string().optional(),
      ttl: z.number().int().min(1).optional(),
      proxied: z.boolean().optional(),
      comment: z.string().optional(),
    },
    async ({ zone_id, record_id, ...body }) =>
      ok(await updateDnsRecord(token, zone_id, record_id, body))
  );

  server.tool(
    "dns_delete_record",
    "Delete a DNS record",
    { zone_id: z.string(), record_id: z.string() },
    async ({ zone_id, record_id }) => ok(await deleteDnsRecord(token, zone_id, record_id))
  );

  // ── Zero Trust — Access ───────────────────────────────────────────────────

  server.tool(
    "zt_list_access_apps",
    "List all Zero Trust Access applications",
    {},
    async () => ok(await listAccessApplications(token, accountId))
  );

  server.tool(
    "zt_create_access_app",
    "Create a Zero Trust Access application",
    {
      name: z.string().describe("Display name"),
      domain: z.string().describe("Protected domain, e.g. app.example.com"),
      type: z.enum(["self_hosted", "saas", "ssh", "vnc", "bookmark"]).optional().default("self_hosted"),
      session_duration: z.string().optional().default("24h").describe("e.g. 24h, 7d"),
      auto_redirect_to_identity: z.boolean().optional().default(false),
    },
    async (body) => ok(await createAccessApplication(token, accountId, body))
  );

  server.tool(
    "zt_delete_access_app",
    "Delete a Zero Trust Access application",
    { app_id: z.string() },
    async ({ app_id }) => ok(await deleteAccessApplication(token, accountId, app_id))
  );

  server.tool(
    "zt_list_access_policies",
    "List policies attached to an Access application",
    { app_id: z.string() },
    async ({ app_id }) => ok(await listAccessPolicies(token, accountId, app_id))
  );

  // ── Zero Trust — Gateway ──────────────────────────────────────────────────

  server.tool(
    "zt_list_gateway_rules",
    "List all Zero Trust Gateway firewall rules (DNS, HTTP, Network)",
    {},
    async () => ok(await listGatewayRules(token, accountId))
  );

  server.tool(
    "zt_create_gateway_rule",
    "Create a Zero Trust Gateway rule",
    {
      name: z.string(),
      action: z.enum(["allow", "block", "audit", "redirect", "l4_override", "isolate", "off"]),
      filters: z.array(z.enum(["http", "dns", "l4", "egress"])).describe("Policy type(s)"),
      traffic: z.string().optional().describe("Wirefilter expression, e.g. 'dns.fqdn == \"malware.com\"'"),
      identity: z.string().optional().describe("Identity selector expression"),
      precedence: z.number().int().min(0).optional(),
      enabled: z.boolean().optional().default(true),
      description: z.string().optional(),
    },
    async (body) => ok(await createGatewayRule(token, accountId, body))
  );

  server.tool(
    "zt_delete_gateway_rule",
    "Delete a Zero Trust Gateway rule",
    { rule_id: z.string() },
    async ({ rule_id }) => ok(await deleteGatewayRule(token, accountId, rule_id))
  );

  server.tool(
    "zt_list_gateway_lists",
    "List Zero Trust Gateway lists (domain/IP allow-block lists)",
    {},
    async () => ok(await listGatewayLists(token, accountId))
  );

  // ── Zero Trust — Tunnels ──────────────────────────────────────────────────

  server.tool(
    "zt_list_tunnels",
    "List all Cloudflare Tunnels",
    {},
    async () => ok(await listTunnels(token, accountId))
  );

  server.tool(
    "zt_get_tunnel",
    "Get details for a specific Cloudflare Tunnel",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await getTunnel(token, accountId, tunnel_id))
  );

  server.tool(
    "zt_get_tunnel_token",
    "Get the connector token for a Cloudflare Tunnel (used to run cloudflared)",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await getTunnelToken(token, accountId, tunnel_id))
  );

  server.tool(
    "zt_list_tunnel_connections",
    "List active connections for a Cloudflare Tunnel",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await listTunnelConnections(token, accountId, tunnel_id))
  );

  return server;
}
