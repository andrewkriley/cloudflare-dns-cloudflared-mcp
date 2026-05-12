# Versioning guide

This matches the approach used in [splunk-lab](https://github.com/andrewkriley/splunk-lab): a root **`VERSION`** file, CI enforcement, and **tag-triggered** releases (no bot opening PRs).

## Source of truth

- **`VERSION`** at the repo root — SemVer `MAJOR.MINOR.PATCH` only (no `v` prefix).
- **`package.json` `version`** — must stay identical. After editing `VERSION`, run:

  ```bash
  npm run sync-version
  ```

  Commit both `VERSION` and `package.json` (and update **`CHANGELOG.md`** for user-facing releases).

The `/health` endpoint and MCP server metadata read `package.json`, so they always reflect the synced value.

## Pull requests

CI runs a **version bump** check on PRs to `main`: **`VERSION` must change** compared to the base branch (same idea as splunk-lab’s `version-bump` job). If the base branch has no `VERSION` file yet, the check is skipped.

There is also a **`VERSION` ↔ `package.json`** job on every Security workflow run.

Optional: add both jobs as **required status checks** in branch protection (alongside your existing checks).

## Releases

1. Merge work to `main` with `VERSION` bumped on the PR.
2. Tag and push (leading `v` required for the workflow):

   ```bash
   git tag v3.0.1
   git push origin v3.0.1
   ```

3. **Release** workflow (`.github/workflows/release.yml`) will:
   - Fail if `VERSION` does not match the tag (without `v`).
   - Fail if `package.json` does not match `VERSION`.
   - Build and push the Docker image to **GHCR** (`ghcr.io/<owner>/cloudflare-dns-cloudflared-mcp`) with `latest`, `x.y.z`, and `x.y` tags.
   - Create a **GitHub Release** with a short changelog (commits since the previous `v*.*.*` tag) and attach a source tarball.
   - Force-update the **`latest` git tag** to the release commit (same pattern as splunk-lab).

`GITHUB_TOKEN` only needs **`contents: write`** and **`packages: write`** here — it does **not** create pull requests.

## Tag format

- Valid: `v1.2.3`
- Invalid: `1.2.3`, `v1.2`, `release-1.2.3`
