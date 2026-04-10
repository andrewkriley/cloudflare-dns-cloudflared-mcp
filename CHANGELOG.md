# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] — 2026-03-29

### Added

- Self-hosted MCP server (Express over HTTP) with bearer-token authentication
- 13 MCP tools across three namespaces: `dns_*`, `tunnel_*`, `service_*`
- High-level workflow tools: `service_expose_ssh`, `service_expose_web`, `service_remove`, `service_list`
- Cloudflare Access integration — Google OAuth + OTP policies per service
- Docker image with multi-stage build, non-root user, and health check
- CI pipeline: secret scanning, TypeScript, ESLint, unit tests, dependency audit, Docker build, tunnel integration tests
- Unit test suite (mocked Cloudflare API) and integration tests against a real ephemeral cloudflared tunnel
- `GET /health` returns `{ "status": "ok", "version": "…" }` with version from `package.json`

[3.0.0]: https://github.com/andrewkriley/cloudflare-dns-cloudflared-mcp/releases/tag/v3.0.0
