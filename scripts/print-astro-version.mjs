import { readFileSync } from "node:fs";

const packageJsonPath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const astroVersion = packageJson.dependencies?.astro;

if (!astroVersion) {
  throw new Error("The root package.json is missing a pinned astro dependency.");
}

process.stdout.write(astroVersion);
