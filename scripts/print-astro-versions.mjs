import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { readAstroVersions } from "./astro-versions.mjs";

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      format: {
        type: "string",
      },
    },
  });

  const versions = readAstroVersions();
  const format = values.format ?? "lines";

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(versions)}\n`);
    return;
  }

  if (format === "lines") {
    process.stdout.write(`${versions.join("\n")}\n`);
    return;
  }

  throw new Error(`Unsupported output format "${format}".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
