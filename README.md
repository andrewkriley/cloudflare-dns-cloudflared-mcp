# cloudflare-dns-cloudflared-mcp

Self-hosted MCP server for administering **Cloudflare DNS** and **cloudflared tunnel** services — expose SSH hosts, web UIs, and other services on your home network through Cloudflare Tunnels with Google OAuth access control.

Runs as a Docker container on your own infrastructure. Connects to Claude Code or any MCP-compatible client via bearer-token-authenticated HTTP.

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

### Tunnels

| Tool | Description |
|------|-------------|
| `tunnel_list` | List all Cloudflare Tunnels |
| `tunnel_get` | Get tunnel details |
| `tunnel_get_token` | Get connector token for cloudflared |
| `tunnel_list_connections` | List active tunnel connections |

### Tunnel Services (workflow)

| Tool | Description |
|------|-------------|
| `service_list` | List all services exposed across all tunnels |
| `service_expose_ssh` | Expose an SSH host through a tunnel with browser-based access |
| `service_expose_web` | Expose a web UI through a tunnel with access control |
| `service_remove` | Remove a service — tears down ingress, DNS, and Access app |

#### What `service_expose_ssh` and `service_expose_web` do

Each workflow tool wires up the full stack in one call:

1. **Tunnel ingress rule** — maps the public hostname to the private backend service
2. **DNS CNAME** — points `subdomain.yourdomain.com` → `[tunnel-id].cfargotunnel.com`
3. **Cloudflare Access application** — gates who can reach the service
4. **Access policy** — allows specific Google accounts, with optional one-time PIN (OTP) for non-Google emails

---

## Prerequisites

### Cloudflare Tunnel

You need a running `cloudflared` tunnel connected to your home network. Install cloudflared on your home server and connect it via the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com). The tunnel must show as **Online** before exposing services through it.

### Google OAuth identity provider

For Google-authenticated access, configure Google as an identity provider once in the Zero Trust dashboard under **Settings → Authentication**. This is a one-time manual setup — the MCP server manages per-service access policies, not the identity provider itself.

---

## Quick start

### 1. Clone

```bash
git clone git@github.com:andrewkriley/cloudflare-dns-cloudflared-mcp.git
cd cloudflare-dns-cloudflared-mcp
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `CF_API_TOKEN` | Cloudflare API token with DNS Edit + Zero Trust Edit |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `MCP_BEARER_TOKEN` | Shared secret for MCP client auth — generate with `openssl rand -hex 32` |

### 3. Run

```bash
docker compose up -d
```

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

### 5. Example usage

Ask Claude:
> "Expose my Proxmox server at 192.168.1.100:8006 as proxmox.yourdomain.com through my home tunnel. Allow access for user@gmail.com."

Claude will call `dns_list_zones`, `tunnel_list`, then `service_expose_web` to wire everything up.

---

## Secrets & Security

### Environment variables

| Variable | Sensitivity | Purpose |
|----------|-------------|---------|
| `CF_API_TOKEN` | Secret | Cloudflare API token — DNS + Zero Trust permissions |
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
npm run lint        # ESLint
npm test            # Vitest unit tests
```

### Docker commands

```bash
docker compose up -d             # start in background
docker compose logs -f           # tail logs
docker compose restart           # restart after .env change
docker compose down              # stop and remove container
docker compose build --no-cache  # force rebuild image
```

---

## CI

Every push and pull request runs:

| Check | Tool | Purpose |
|-------|------|---------|
| Secret scanning | Gitleaks | Detects accidentally committed tokens |
| TypeScript check | `tsc --noEmit` | Strict compile-time correctness |
| ESLint | `eslint` | Code quality and style |
| Dependency audit | `npm audit --audit-level=high` | Flags high/critical vulnerabilities |
| Docker build | `docker/build-push-action` | Verifies image builds successfully |

---

## Contributing

`main` is protected — all changes via PR from `dev`. CI must pass and 1 approval required before merge. Direct pushes to `main` are blocked.
