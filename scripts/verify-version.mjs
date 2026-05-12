/**
 * CI: fail if VERSION and package.json "version" differ.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromFile = readFileSync(join(root, "VERSION"), "utf8").trim();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (fromFile !== pkg.version) {
  console.error(
    `VERSION (${JSON.stringify(fromFile)}) does not match package.json version (${JSON.stringify(pkg.version)}). Run: npm run sync-version`
  );
  process.exit(1);
}
console.log(`✓ VERSION and package.json agree: ${fromFile}`);
