# cloudflare-dns-zt-mcp

Self-hosted MCP server for administering **Cloudflare DNS records** and **Zero Trust** (Access, Gateway, Tunnels). Runs as a Docker container on your own infrastructure. Connects to Claude Code or any MCP-compatible client via bearer-token-authenticated HTTP.

---

## Tools

### DNS

| Tool | Description |
|------|-------------|
| `dns_list_zones` | List all zones in the account |
| `dns_list_records` | List DNS records for a zone |
| `dns_create_record` | Create a DNS record (A, AAAA, CNAME, MX, TXT, …) |
| `dns_update_record` | Update an existing DNS record |
| `dns_delete_record` | Delete a DNS record |

### Zero Trust — Access

| Tool | Description |
|------|-------------|
| `zt_list_access_apps` | List Access applications |
| `zt_create_access_app` | Create an Access application |
| `zt_delete_access_app` | Delete an Access application |
| `zt_list_access_policies` | List policies on an Access application |

### Zero Trust — Gateway

| Tool | Description |
|------|-------------|
| `zt_list_gateway_rules` | List Gateway firewall rules |
| `zt_create_gateway_rule` | Create a Gateway rule (DNS, HTTP, Network) |
| `zt_delete_gateway_rule` | Delete a Gateway rule |
| `zt_list_gateway_lists` | List allow/block lists |

### Zero Trust — Tunnels

| Tool | Description |
|------|-------------|
| `zt_list_tunnels` | List Cloudflare Tunnels |
| `zt_get_tunnel` | Get tunnel details |
| `zt_get_tunnel_token` | Get connector token for cloudflared |
| `zt_list_tunnel_connections` | List active tunnel connections |

---

## Quick start

### 1. Clone

```bash
git clone git@github.com:andrewkriley/cloudflare-dns-zt-mcp.git
cd cloudflare-dns-zt-mcp
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in three values:

| Variable | Description |
|----------|-------------|
| `CF_API_TOKEN` | Cloudflare API token with DNS Edit + Zero Trust Edit |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `MCP_BEARER_TOKEN` | Shared secret for MCP client auth — generate with `openssl rand -hex 32` |

### 3. Run

```bash
docker compose up -d
```

The server starts at `http://localhost:3000/mcp`.

Check it's healthy:
```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### 4. Connect Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "cloudflare-admin": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp",
        "--header",
        "Authorization: Bearer YOUR_MCP_BEARER_TOKEN"
      ]
    }
  }
}
```

Replace `YOUR_MCP_BEARER_TOKEN` with the value from your `.env`.

---

## Secrets & Security

### Environment variables

| Variable | Sensitivity | Purpose |
|----------|-------------|---------|
| `CF_API_TOKEN` | Secret | Cloudflare API admin token — DNS + ZT permissions |
| `CF_ACCOUNT_ID` | Low | Cloudflare account identifier |
| `MCP_BEARER_TOKEN` | Secret | Shared secret for MCP endpoint auth |
| `MCP_PORT` | Low | HTTP port (default: 3000) |

All are loaded from `.env` via `docker compose`. The `.env` file is gitignored and must never be committed.

### Creating the Cloudflare API token

Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) and create a token with:

| Scope | Permission |
|-------|------------|
| Zone > DNS | Edit |
| Account > Zero Trust | Edit |

Set a **90-day expiry** at creation time.

### Token rotation (every 90 days)

1. Create a new token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Update `CF_API_TOKEN` in `.env`
3. Restart the container: `docker compose restart`
4. Delete the old token in the Cloudflare dashboard

### Generating a bearer token

```bash
openssl rand -hex 32
```

Update `MCP_BEARER_TOKEN` in `.env` and update your Claude Code `settings.json` to match.

### Security controls

| Control | What it does |
|---------|--------------|
| Bearer token auth | All `/mcp` requests require `Authorization: Bearer <token>` |
| Non-root container | Process runs as unprivileged `mcp` user |
| Read-only filesystem | Container root filesystem is read-only (`tmpfs` for `/tmp`) |
| No new privileges | `no-new-privileges:true` prevents privilege escalation |
| `/health` is auth-free | Returns `{"status":"ok"}` only — no sensitive data exposed |

---

## Development

### Run locally without Docker

```bash
npm install
cp .env.example .env
# fill in .env
npm run dev
```

### Build and type-check

```bash
npm run build       # compile TypeScript
npm run typecheck   # type-check without emitting
```

### Docker commands

```bash
docker compose up -d          # start in background
docker compose logs -f        # tail logs
docker compose restart        # restart after .env change
docker compose down           # stop and remove container
docker compose build --no-cache  # force rebuild image
```

---

## CI

Every push and pull request runs:

| Check | Tool | Purpose |
|-------|------|---------|
| Secret scanning | Gitleaks | Detects accidentally committed tokens |
| TypeScript check | `tsc --noEmit` | Strict compile-time correctness |
| Dependency audit | `npm audit --audit-level=high` | Flags high/critical vulnerabilities |
| Docker build | `docker/build-push-action` | Verifies image builds successfully |

---

## Contributing

`main` is protected — all changes via PR from `dev`. CI must pass and 1 approval required before merge. Direct pushes to `main` are blocked.
