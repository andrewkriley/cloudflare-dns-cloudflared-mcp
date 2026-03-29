# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning strategy

- **`package.json`** is the single source of truth for the version number.
- The version is read from `package.json` at build time and surfaced in two places:
  - The MCP server's protocol metadata (`name: "cloudflare-admin", version: "…"`)
  - The `GET /health` HTTP endpoint (`{ "status": "ok", "version": "…" }`)
- To release a new version: bump `"version"` in `package.json`, add an entry below, and tag the commit (e.g. `git tag v3.1.0`).

---

## [3.0.0] — 2026-03-29

### Added
- Initial public release.
- 13 MCP tools across three namespaces: `dns_*`, `tunnel_*`, `service_*`.
- `service_expose_ssh` — exposes an SSH service through a Cloudflare Tunnel with browser access and Google OAuth + OTP.
- `service_expose_web` — exposes a web UI through a Cloudflare Tunnel with access control.
- `service_remove` — tears down a previously exposed service.
- `service_list` — lists all services currently exposed through Cloudflare Tunnels.
- Bearer-token-authenticated Express HTTP server.
- Multi-stage Docker image (`node:20-alpine`, non-root user).
- Unit tests (17) and integration tests (6).
- `GET /health` endpoint now returns `{ "status": "ok", "version": "…" }`.
- Version sourced from `package.json` — no more hardcoded version strings in source code.
