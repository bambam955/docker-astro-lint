import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

function parseAstroVersion(version) {
  // The publish workflow only supports stable pinned releases because those
  // are the only versions that map cleanly onto major/minor rolling tags.
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(version);

  if (!match?.groups) {
    throw new Error(
      `Expected a stable Astro version in major.minor.patch form, received "${version}".`,
    );
  }

  return match.groups;
}

export function buildImageTags({ imageName, variant, version }) {
  const { major, minor, patch } = parseAstroVersion(version);
  const exactVersion = `${major}.${minor}.${patch}`;

  if (variant === "slim") {
    // Debian slim is the default image family, so it owns the unsuffixed tags.
    return [
      `${imageName}:${exactVersion}`,
      `${imageName}:${major}.${minor}`,
      `${imageName}:${major}`,
      `${imageName}:latest`,
    ];
  }

  if (variant === "alpine") {
    // Alpine stays opt-in so callers never land on a musl-based image
    // unless they asked for it explicitly.
    return [
      `${imageName}:${exactVersion}-alpine`,
      `${imageName}:${major}.${minor}-alpine`,
      `${imageName}:${major}-alpine`,
      `${imageName}:latest-alpine`,
    ];
  }

  throw new Error(`Unsupported image variant "${variant}".`);
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
