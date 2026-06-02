import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  getRollingTagOwnership,
  parseAstroVersion,
  readAstroVersions,
} from "./astro-versions.mjs";

export function buildImageTags({ imageName, variant, version, versions }) {
  const { major, minor, patch } = parseAstroVersion(version);
  const exactVersion = `${major}.${minor}.${patch}`;
  const { ownsLatest, ownsMajor } = getRollingTagOwnership({
    version: exactVersion,
    versions,
  });
  const suffix = variant === "slim" ? "" : variant === "alpine" ? "-alpine" : null;

  if (suffix === null) {
    throw new Error(`Unsupported image variant "${variant}".`);
  }

  const tags = [
    `${imageName}:${exactVersion}${suffix}`,
    `${imageName}:${major}.${minor}${suffix}`,
  ];

  if (ownsMajor) {
    tags.push(`${imageName}:${major}${suffix}`);
  }

  if (ownsLatest) {
    tags.push(`${imageName}:latest${suffix}`);
  }

  return tags;
}

function writeOutputs({ outputPath, tags }) {
  const lines = [
    "tags<<__IMAGE_TAGS__",
    ...tags,
    "__IMAGE_TAGS__",
  ];

  appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

export function formatTags({ format, tags }) {
  if (format === "bake") {
    throw new Error("The bake format requires a target name; call buildBakeOverride instead.");
  }

  if (format === "csv") {
    // Bake accepts comma-delimited tag overrides, so keep that translation in
    // one place instead of rebuilding it inline in the workflow shell.
    return tags.join(",");
  }

  if (format === "lines") {
    return tags.join("\n");
  }

  throw new Error(`Unsupported output format "${format}".`);
}

export function buildBakeOverride({ target, tags }) {
  if (!target) {
    throw new Error("Missing required bake target name.");
  }

  // Bake merge files preserve list types, which lets the workflow inject a
  // computed multi-tag release definition without flattening it into a string.
  return JSON.stringify(
    {
      target: {
        [target]: {
          tags,
        },
      },
    },
    null,
    2,
  );
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      format: {
        type: "string",
      },
      image: {
        type: "string",
      },
      output: {
        type: "string",
      },
      target: {
        type: "string",
      },
      variant: {
        type: "string",
      },
      version: {
        type: "string",
      },
    },
  });

  if (!values.image) {
    throw new Error("Missing required --image argument.");
  }

  if (!values.variant) {
    throw new Error("Missing required --variant argument.");
  }

  if (!values.version) {
    throw new Error("Missing required --version argument.");
  }

  const tags = buildImageTags({
    imageName: values.image,
    variant: values.variant,
    version: values.version,
    versions: readAstroVersions(),
  });

  if (values.output) {
    writeOutputs({ outputPath: values.output, tags });
    return;
  }

  const format = values.format ?? "lines";

  if (format === "bake") {
    process.stdout.write(
      `${buildBakeOverride({ target: values.target, tags })}\n`,
    );
    return;
  }

  process.stdout.write(`${formatTags({ format, tags })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
