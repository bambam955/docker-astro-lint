import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { parseAstroVersion } from "./astro-versions.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureSourceDir = path.join(repoRoot, "fixtures", "test-site");

function getManifestDir(version) {
  const normalizedVersion = parseAstroVersion(version).normalized;
  return path.join(repoRoot, "manifests", "fixtures", normalizedVersion);
}

export function prepareSmokeFixture({ outputDir, version }) {
  if (!outputDir) {
    throw new Error("Missing required outputDir value.");
  }

  mkdirSync(outputDir, { recursive: true });

  // The smoke fixture source tree stays version-agnostic while each pinned
  // package manifest pair is overlaid from the tracked manifest set.
  cpSync(fixtureSourceDir, outputDir, {
    force: true,
    recursive: true,
    filter(sourcePath) {
      return path.basename(sourcePath) !== "node_modules";
    },
  });

  const manifestDir = getManifestDir(version);
  copyFileSync(path.join(manifestDir, "package.json"), path.join(outputDir, "package.json"));
  copyFileSync(
    path.join(manifestDir, "package-lock.json"),
    path.join(outputDir, "package-lock.json"),
  );
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: {
        type: "string",
      },
      version: {
        type: "string",
      },
    },
  });

  if (!values.output) {
    throw new Error("Missing required --output argument.");
  }

  if (!values.version) {
    throw new Error("Missing required --version argument.");
  }

  prepareSmokeFixture({
    outputDir: path.resolve(values.output),
    version: values.version,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
