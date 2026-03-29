# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are generated automatically from [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) using [release-please](https://github.com/googleapis/release-please).

---

## [3.0.0] — 2026-03-29

### Added

- Self-hosted MCP server (Express over HTTP) with bearer-token authentication
- 13 MCP tools across three namespaces: `dns_*`, `tunnel_*`, `service_*`
- High-level workflow tools: `service_expose_ssh`, `service_expose_web`, `service_remove`, `service_list`
- Cloudflare Access integration — Google OAuth + OTP policies per service
- Docker image with multi-stage build, non-root user, and health check
- CI pipeline: secret scanning, TypeScript, ESLint, unit tests, dependency audit, Docker build, tunnel integration tests
- Unit test suite (16 tests, fully mocked Cloudflare API)
- Integration test suite against a real ephemeral cloudflared tunnel

[3.0.0]: https://github.com/andrewkriley/cloudflare-dns-cloudflared-mcp/releases/tag/v3.0.0
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
