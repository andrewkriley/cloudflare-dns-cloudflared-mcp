# cloudflare-dns-zt-mcp

Remote MCP server deployed on Cloudflare Workers for administering **DNS records** and **Zero Trust** (Access, Gateway, Tunnels) via Claude Code or any MCP-compatible client.

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

## Setup

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm install -g wrangler`)
- Cloudflare account with Workers, Zero Trust, and DNS access

### 1. Clone and install

```bash
git clone git@github.com:andrewkriley/cloudflare-dns-zt-mcp.git
cd cloudflare-dns-zt-mcp
npm install
```

### 2. Create a Cloudflare API token

Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) and create a token with:

| Scope | Permission |
|-------|------------|
| Zone > DNS | Edit |
| Account > Zero Trust | Edit |
| Account > Account Settings | Read |

### 3. Configure local development

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in CF_API_TOKEN and CF_ACCOUNT_ID
```

### 4. Run locally

```bash
npm start
# Server runs at http://localhost:8788/mcp
```

Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector@latest
# Open http://localhost:5173, connect to http://localhost:8788/mcp
```

### 5. Deploy to Cloudflare Workers

```bash
wrangler secret put CF_API_TOKEN
wrangler secret put CF_ACCOUNT_ID
npm run deploy
```

The server will be available at `https://cloudflare-dns-zt-mcp.<your-subdomain>.workers.dev/mcp`

### 6. Add to Claude Code

Add to `~/.claude/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "cloudflare-admin": {
      "command": "npx",
      "args": ["mcp-remote", "https://cloudflare-dns-zt-mcp.<your-subdomain>.workers.dev/mcp"]
    }
  }
}
```

Or for local development:

```json
{
  "mcpServers": {
    "cloudflare-admin": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8788/mcp"]
    }
  }
}
```

---

## Secrets & Security

### Token architecture

This project uses **two separate tokens** following least-privilege principles:

| Token | Permissions | Where it lives |
|-------|-------------|----------------|
| `CF_API_TOKEN` | `Zone > DNS > Edit`, `Account > Zero Trust > Edit` | Wrangler secret on the Worker + `.dev.vars` locally |
| `CF_DEPLOY_TOKEN` | `Account > Workers Scripts > Edit` | GitHub `production` Environment secret only |
| `CF_ACCOUNT_ID` | — (not sensitive) | GitHub `production` Environment secret + `.dev.vars` locally |

`CF_API_TOKEN` is the runtime admin token — it never touches GitHub. It is injected into the Worker at deploy time via `wrangler secret put` and used by the MCP server to call Cloudflare APIs.

`CF_DEPLOY_TOKEN` is the CI/CD deploy token — it can only deploy Workers, not read or modify DNS or Zero Trust config. It lives only in the GitHub `production` Environment secret store.

### Creating tokens

Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).

**Admin token (`CF_API_TOKEN`):**
- Zone > DNS > Edit
- Account > Zero Trust > Edit
- Set expiry: 90 days from today

**Deploy token (`CF_DEPLOY_TOKEN`):**
- Account > Workers Scripts > Edit
- Set expiry: 90 days from today

### Token rotation

Rotate both tokens every **90 days**. Setting an expiry at creation time in the Cloudflare dashboard enforces this automatically — an expired token will cause CI to fail, which is your signal to rotate.

**Rotation procedure:**
1. Create a new token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. For `CF_API_TOKEN`: run `wrangler secret put CF_API_TOKEN` with the new value
3. For `CF_DEPLOY_TOKEN`: update the GitHub `production` Environment secret
4. Delete the old token in the Cloudflare dashboard
5. Update `.dev.vars` locally if needed

### Setting Worker secrets (runtime admin token)

```bash
wrangler secret put CF_API_TOKEN
# Enter your DNS + Zero Trust admin token when prompted

wrangler secret put CF_ACCOUNT_ID
# Enter your account ID when prompted
```

### CI/CD security

Every push and pull request runs three security checks:

| Check | Tool | Purpose |
|-------|------|---------|
| Secret scanning | [Gitleaks](https://github.com/gitleaks/gitleaks) | Detects accidentally committed tokens across full git history |
| TypeScript check | `tsc --noEmit` | Enforces strict compile-time correctness |
| Dependency audit | `npm audit --audit-level=high` | Flags high/critical vulnerable dependencies |

A nightly scheduled scan also runs against `main`.

Deployment to Cloudflare Workers requires **manual approval** via the GitHub `production` Environment. No code reaches the Worker without a human approving the deployment.

### Protecting the MCP endpoint

The `/mcp` endpoint exposes destructive operations. Protect it using one of:

- **Cloudflare Access** — put the Worker behind a Zero Trust Access application (recommended)
- **mTLS** — restrict by client certificate via Cloudflare API Shield
- **Bearer token** — add a shared secret check in the Worker fetch handler

---

## Development

```bash
# Watch mode
npm start

# Deploy
npm run deploy

# Tail logs
wrangler tail

# Type generation from wrangler bindings
npm run cf-typegen
```
