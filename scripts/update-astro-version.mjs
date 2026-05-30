import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const manifestPaths = [
  new URL("../package.json", import.meta.url),
  new URL("../fixtures/test-site/package.json", import.meta.url),
];

const latestAstroVersion = JSON.parse(
  execFileSync("npm", ["view", "astro", "version", "--json"], {
    encoding: "utf8",
  }),
);

let updatedManifestCount = 0;

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const currentAstroVersion = manifest.dependencies?.astro;

  if (!currentAstroVersion) {
    throw new Error(`Missing astro dependency in ${manifestPath.pathname}`);
  }

  if (currentAstroVersion === latestAstroVersion) {
    continue;
  }

  manifest.dependencies.astro = latestAstroVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  updatedManifestCount += 1;
}

if (updatedManifestCount === 0) {
  console.log(`Astro is already pinned at ${latestAstroVersion}.`);
} else {
  console.log(`Updated Astro pins to ${latestAstroVersion} in ${updatedManifestCount} manifest(s).`);
}
