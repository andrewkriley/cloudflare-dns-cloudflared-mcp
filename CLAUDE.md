# CLAUDE.md

## Project purpose

Self-hosted MCP server (v3.0.0) that gives Claude Code programmatic control over Cloudflare DNS and cloudflared tunnel services for a home network. The primary use case is exposing home-network services (SSH hosts, web UIs) through Cloudflare Tunnels with Google OAuth + OTP access control.

## Architecture

```
src/
  index.ts              — Express HTTP server, bearer token auth, MCP session routing
  server.ts             — MCP tool definitions (13 tools), wires tools to handlers
  cloudflare-api.ts     — Thin Cloudflare REST API v4 wrapper (all fetch calls here)
  tools/
    workflow.ts         — The 4 workflow tool handlers (expose SSH, expose web, remove, list)
```

The workflow tools in `src/tools/workflow.ts` are the core of the project — each one orchestrates multiple Cloudflare API calls in sequence to wire up or tear down a complete service:

- `exposeSshService` → getZone → getTunnelConfig → putTunnelConfig → createDnsRecord → createAccessApplication → createAccessPolicy
- `exposeWebService` → same pattern, different service URL format
- `removeService` → getTunnelConfig → putTunnelConfig → listDnsRecords → deleteDnsRecord → listAccessApplications → listAccessPolicies → deleteAccessPolicy → deleteAccessApplication
- `listServices` → listTunnels → getTunnelConfig (per tunnel) → listAccessApplications → join by hostname

## Tool naming conventions

| Prefix | Scope |
|--------|-------|
| `dns_` | DNS zone and record management |
| `tunnel_` | Cloudflare Tunnel metadata and tokens |
| `service_` | High-level workflow tools (expose/remove services) |

## Testing approach

**TDD was used for initial development.** Tests were written first, then implementation.

- **Unit tests** (`src/__tests__/workflow.test.ts`) — 16 tests, fully mocked Cloudflare API via `vi.mock`. Run with `npm test`. These run on every `git push` via the pre-push hook and in CI.
- **Integration tests** (`src/__tests__/integration/workflow.integration.test.ts`) — 6 tests against a real Cloudflare API. Skipped locally unless env vars are set. Run in CI only via `integration.yml` workflow.
- **Integration tests are NOT run locally** — they require `CF_API_TOKEN_CI`, `CF_ACCOUNT_ID`, `CI_TUNNEL_ID`, `CF_TEST_ZONE_ID` env vars. Do not add them to CI security pipeline.

Run unit tests: `npm test`
Run integration tests (CI only): `npm run test:integration`

## CI pipeline

7 required checks on every PR to `main`:

1. Secret Scanning (Gitleaks)
2. TypeScript Check
3. ESLint
4. Unit Tests
5. Dependency Audit
6. Docker Build Check
7. Tunnel Integration Tests — spins up a real ephemeral `cloudflared` tunnel, runs full lifecycle tests, always cleans up

## Key Cloudflare API patterns

- Tunnel ingress config: `GET/PUT /accounts/{id}/cfd_tunnel/{tunnel_id}/configurations` — the `config.ingress` array must always end with a catch-all `{ service: "http_status:404" }` rule
- Access apps: `POST /accounts/{id}/access/apps` with `type: "self_hosted"`
- Access policies: `POST /accounts/{id}/access/apps/{app_id}/policies` — `include` array uses `{ email: { email: "..." } }` for Google OAuth and `{ auth_method: { auth_method: "otp" } }` for OTP

## Branch workflow

- `main` — protected, requires PR + all CI checks
- `dev` — active development branch, PRs to `main`
- No direct pushes to `main`
- Pre-push hook runs unit tests before every push

## GitHub Actions secrets and variables

| Name | Type | Purpose |
|------|------|---------|
| `CF_API_TOKEN` | Secret | Production MCP server token |
| `CF_ACCOUNT_ID` | Secret | Cloudflare account ID (32-char hex) |
| `CF_API_TOKEN_CI` | Secret | Integration test token (Tunnel Edit + Zero Trust Edit + DNS Edit + Zone Read) |
| `CF_TEST_ZONE_ID` | Variable | Zone for integration test DNS records — accepts domain name or zone ID |

## Known limitation: browser SSH and short-lived certs

Cloudflare's browser-rendered SSH terminal uses **libssh2 1.9.0**, which does not support OpenSSH certificate authentication (added in libssh2 1.11.0). This means `service_expose_ssh` produces a correct server-side sshd config, but the Cloudflare browser terminal cannot present the short-lived cert — it falls back to prompting for a private key.

**Diagnosed via:** `sshd -T` (config correct), CA key fingerprint match confirmed, Access app type `ssh` confirmed, `DEBUG3` sshd log showing `Remote software version libssh2_1.9.0_DEV`.

**Short-lived certs work** for native SSH via `cloudflared` ProxyCommand — the limitation is browser-only.

**Workarounds for browser-only access:**
- **Password auth** — acceptable behind Access/Google OAuth since SSH is not publicly exposed
- **wetty** — deploy as a web service, expose via `service_expose_web`; the browser connects to wetty over HTTPS and wetty SSHes to localhost, bypassing libssh2 entirely

Do not attempt to debug sshd cert config further — the server side is correct. The root cause is on Cloudflare's infrastructure.

## What was deliberately cut

Gateway tools (firewall rules, DNS filtering lists) were removed in v3.0.0. The scope is specifically tunnel-based service exposure, not general Zero Trust policy management.
