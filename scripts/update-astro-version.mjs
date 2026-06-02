import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  getConfiguredMinorLines,
  getPrimaryAstroVersion,
  parseAstroVersion,
  readAstroVersions,
} from "./astro-versions.mjs";

const versionConfigPath = new URL("../astro-versions.json", import.meta.url);
const toolTemplatePath = new URL("../package.json", import.meta.url);
const fixtureTemplatePath = new URL("../fixtures/test-site/package.json", import.meta.url);
const toolManifestsRoot = new URL("../manifests/tools/", import.meta.url);
const fixtureManifestsRoot = new URL("../manifests/fixtures/", import.meta.url);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runNpm(args, { cwd }) {
  execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function createVersionedManifest(template, astroVersion) {
  const manifest = structuredClone(template);

  if (!manifest.dependencies?.astro) {
    throw new Error(`Missing astro dependency in ${template.name ?? "manifest template"}.`);
  }

  manifest.dependencies.astro = astroVersion;
  return manifest;
}

function resolveLatestPatchVersion(minorLine) {
  const latestVersion = JSON.parse(
    execFileSync("npm", ["view", `astro@${minorLine}`, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  return parseAstroVersion(latestVersion).normalized;
}

function refreshConfiguredVersions() {
  const currentVersions = readAstroVersions();
  const refreshedVersions = getConfiguredMinorLines(currentVersions).map((minorLine) =>
    resolveLatestPatchVersion(minorLine),
  );

  writeJson(versionConfigPath, { versions: refreshedVersions });
  return refreshedVersions;
}

function pruneManifestRoot({ manifestsRoot, versions }) {
  const rootPath = fileURLToPath(manifestsRoot);
  mkdirSync(rootPath, { recursive: true });

  for (const directoryEntry of readdirSync(rootPath, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory()) {
      continue;
    }

    if (!versions.includes(directoryEntry.name)) {
      rmSync(path.join(rootPath, directoryEntry.name), { force: true, recursive: true });
    }
  }
}

function writeManifestSet({ astroVersion, manifestsRoot, template }) {
  const manifestDir = new URL(`${astroVersion}/`, manifestsRoot);
  mkdirSync(manifestDir, { recursive: true });
  writeJson(new URL("package.json", manifestDir), createVersionedManifest(template, astroVersion));
  runNpm(["install", "--package-lock-only"], { cwd: fileURLToPath(manifestDir) });
}

function syncPrimaryManifest({ astroVersion, targetDir, template }) {
  writeJson(new URL("package.json", targetDir), createVersionedManifest(template, astroVersion));
  runNpm(["install", "--package-lock-only"], { cwd: fileURLToPath(targetDir) });
}

function main() {
  const refreshedVersions = refreshConfiguredVersions();
  const toolTemplate = readJson(toolTemplatePath);
  const fixtureTemplate = readJson(fixtureTemplatePath);

  pruneManifestRoot({ manifestsRoot: toolManifestsRoot, versions: refreshedVersions });
  pruneManifestRoot({ manifestsRoot: fixtureManifestsRoot, versions: refreshedVersions });

  for (const astroVersion of refreshedVersions) {
    writeManifestSet({
      astroVersion,
      manifestsRoot: toolManifestsRoot,
      template: toolTemplate,
    });
    writeManifestSet({
      astroVersion,
      manifestsRoot: fixtureManifestsRoot,
      template: fixtureTemplate,
    });
  }

  const primaryAstroVersion = getPrimaryAstroVersion(refreshedVersions);
  syncPrimaryManifest({
    astroVersion: primaryAstroVersion,
    targetDir: new URL("../", import.meta.url),
    template: toolTemplate,
  });
  syncPrimaryManifest({
    astroVersion: primaryAstroVersion,
    targetDir: new URL("../fixtures/test-site/", import.meta.url),
    template: fixtureTemplate,
  });

  console.log(
    `Refreshed Astro support set: ${refreshedVersions.join(", ")}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
