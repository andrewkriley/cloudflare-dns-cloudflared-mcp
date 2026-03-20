import { CloudflareAdminMCP } from "./mcp";

export { CloudflareAdminMCP };

export default {
  fetch(request: Request, env: Parameters<typeof CloudflareAdminMCP.mount>[1], ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      return CloudflareAdminMCP.mount("/mcp").fetch(request, env, ctx);
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", server: "cloudflare-admin-mcp" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        name: "cloudflare-dns-zt-mcp",
        description: "Remote MCP server for Cloudflare DNS and Zero Trust administration",
        endpoint: "/mcp",
        tools: [
          "dns_list_zones", "dns_list_records", "dns_create_record", "dns_update_record", "dns_delete_record",
          "zt_list_access_apps", "zt_create_access_app", "zt_delete_access_app", "zt_list_access_policies",
          "zt_list_gateway_rules", "zt_create_gateway_rule", "zt_delete_gateway_rule", "zt_list_gateway_lists",
          "zt_list_tunnels", "zt_get_tunnel", "zt_get_tunnel_token", "zt_list_tunnel_connections",
        ],
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  },
};
