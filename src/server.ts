import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listZones,
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  listTunnels,
  getTunnel,
  getTunnelToken,
  listTunnelConnections,
} from "./cloudflare-api.js";
import {
  exposeSshService,
  exposeWebService,
  removeService,
  listServices,
} from "./tools/workflow.js";

function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function createServer(token: string, accountId: string): McpServer {
  const server = new McpServer({ name: "cloudflare-admin", version: "3.0.0" });

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

  // ── Tunnels ───────────────────────────────────────────────────────────────

  server.tool(
    "tunnel_list",
    "List all Cloudflare Tunnels",
    {},
    async () => ok(await listTunnels(token, accountId))
  );

  server.tool(
    "tunnel_get",
    "Get details for a specific Cloudflare Tunnel",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await getTunnel(token, accountId, tunnel_id))
  );

  server.tool(
    "tunnel_get_token",
    "Get the connector token for a Cloudflare Tunnel (used to run cloudflared)",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await getTunnelToken(token, accountId, tunnel_id))
  );

  server.tool(
    "tunnel_list_connections",
    "List active connections for a Cloudflare Tunnel",
    { tunnel_id: z.string() },
    async ({ tunnel_id }) => ok(await listTunnelConnections(token, accountId, tunnel_id))
  );

  // ── Tunnel services (workflow) ────────────────────────────────────────────

  server.tool(
    "service_list",
    "List all services exposed through Cloudflare Tunnels, including their DNS hostname, backend, and Access app",
    {},
    async () => ok(await listServices(token, accountId))
  );

  server.tool(
    "service_expose_ssh",
    "Expose an SSH service through a Cloudflare Tunnel with browser-based access. Creates a tunnel ingress rule, DNS CNAME, and Cloudflare Access application with Google auth and optional OTP.",
    {
      tunnel_id: z.string().describe("Tunnel ID from tunnel_list"),
      zone_id: z.string().describe("Zone ID from dns_list_zones — determines the domain used"),
      subdomain: z.string().describe("Subdomain label, e.g. 'homeserver' → homeserver.yourdomain.com"),
      backend_host: z.string().describe("Private IP or hostname of the SSH target, e.g. 192.168.1.10"),
      backend_port: z.number().int().min(1).max(65535).default(22).describe("SSH port (default 22)"),
      allowed_emails: z.array(z.string().email()).min(1).describe("Google account emails permitted to access"),
      allow_otp: z.boolean().default(false).describe("Also allow one-time PIN access for non-Google email addresses"),
    },
    async (params) => ok(await exposeSshService(token, accountId, params))
  );

  server.tool(
    "service_expose_web",
    "Expose a web UI through a Cloudflare Tunnel with access control. Creates a tunnel ingress rule, DNS CNAME, and Cloudflare Access application with Google auth and optional OTP.",
    {
      tunnel_id: z.string().describe("Tunnel ID from tunnel_list"),
      zone_id: z.string().describe("Zone ID from dns_list_zones — determines the domain used"),
      subdomain: z.string().describe("Subdomain label, e.g. 'proxmox' → proxmox.yourdomain.com"),
      backend_host: z.string().describe("Private IP or hostname of the web service"),
      backend_port: z.number().int().min(1).max(65535).describe("Port the service listens on"),
      backend_protocol: z.enum(["http", "https"]).describe("Protocol the backend service uses"),
      service_name: z.string().describe("Friendly display name for the Access application, e.g. 'Proxmox'"),
      allowed_emails: z.array(z.string().email()).min(1).describe("Google account emails permitted to access"),
      allow_otp: z.boolean().default(false).describe("Also allow one-time PIN access for non-Google email addresses"),
      no_tls_verify: z.boolean().default(false).describe("Disable TLS certificate verification for the backend (required for self-signed certs, e.g. Proxmox)"),
    },
    async (params) => ok(await exposeWebService(token, accountId, params))
  );

  server.tool(
    "service_remove",
    "Remove a service exposed through a Cloudflare Tunnel. Deletes the tunnel ingress rule, DNS record, Access policies, and Access application for the given hostname.",
    {
      hostname: z.string().describe("Full hostname of the service to remove, e.g. homeserver.example.com"),
      tunnel_id: z.string().describe("Tunnel ID the service is routed through"),
      zone_id: z.string().describe("Zone ID the DNS record lives in"),
    },
    async (params) => ok(await removeService(token, accountId, params))
  );

  return server;
}
