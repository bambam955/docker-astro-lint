import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { validateAstroVersions } from "./astro-versions.mjs";

export const publishInputPaths = [
  ".github/workflows/publish.yml",
  "Dockerfile.alpine",
  "Dockerfile.slim",
  "docker-bake.hcl",
  "manifests/fixtures",
  "manifests/tools",
  // Keep publish script changes from going stale on main. These scripts shape
  // the release matrix, fixture setup, tag generation, and publish decision.
  "scripts/astro-versions.mjs",
  "scripts/decide-publish.mjs",
  "scripts/prepare-smoke-fixture.mjs",
  "scripts/print-astro-versions.mjs",
  "scripts/print-image-tags.mjs",
  "scripts/smoke-test-image.sh",
];

function runGit(args, { repoRoot, allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      // Keep expected probe failures out of the workflow logs.
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch (error) {
    if (allowFailure) {
      return null;
    }

    throw error;
  }
}

function isMissingRevision(revision) {
  return !revision || /^0+$/.test(revision);
}

function hasCommit({ repoRoot, revision }) {
  return runGit(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], {
    repoRoot,
    allowFailure: true,
  }) !== null;
}

function hasFileAtRevision({ repoRoot, revision, filePath }) {
  return runGit(["cat-file", "-e", `${revision}:${filePath}`], {
    repoRoot,
    allowFailure: true,
  }) !== null;
}

function readAstroVersionsAtRevision({ repoRoot, revision, allowMissing = false }) {
  // Older revisions can predate the managed version set entirely. Treat that
  // as "no previous version set" so the caller can fall back to path diffs.
  if (
    allowMissing &&
    !hasFileAtRevision({ filePath: "astro-versions.json", repoRoot, revision })
  ) {
    return null;
  }

  const versionConfig = JSON.parse(
    runGit(["show", `${revision}:astro-versions.json`], { repoRoot }),
  );

  if (!versionConfig || typeof versionConfig !== "object" || !("versions" in versionConfig)) {
    throw new Error(`The astro-versions.json at ${revision} is missing a versions array.`);
  }

  return validateAstroVersions(versionConfig.versions);
}

function listChangedPublishInputs({ repoRoot, beforeRef, headRef }) {
  const changedPaths = runGit(
    ["diff", "--name-only", `${beforeRef}..${headRef}`, "--", ...publishInputPaths],
    { repoRoot },
  );

  if (!changedPaths) {
    return [];
  }

  return changedPaths.split("\n");
}

export function decidePublish({
  repoRoot = process.cwd(),
  eventName,
  beforeRef,
  headRef = "HEAD",
} = {}) {
  if (eventName === "workflow_dispatch") {
    return {
      changedInputs: [],
      currentVersions: null,
      previousVersions: null,
      reason: "manual-dispatch",
      shouldPublish: true,
    };
  }

  // GitHub uses the all-zero SHA when a push does not have a stable prior tip.
  if (isMissingRevision(beforeRef) || !hasCommit({ repoRoot, revision: beforeRef })) {
    return {
      changedInputs: [],
      currentVersions: null,
      previousVersions: null,
      reason: "missing-before-revision",
      shouldPublish: true,
    };
  }

  const currentVersions = readAstroVersionsAtRevision({ repoRoot, revision: headRef });
  const previousVersions = readAstroVersionsAtRevision({
    allowMissing: true,
    repoRoot,
    revision: beforeRef,
  });

  if (
    previousVersions &&
    JSON.stringify(currentVersions) !== JSON.stringify(previousVersions)
  ) {
    return {
      changedInputs: [],
      currentVersions,
      previousVersions,
      reason: "astro-versions-changed",
      shouldPublish: true,
    };
  }

  const changedInputs = listChangedPublishInputs({ repoRoot, beforeRef, headRef });

  if (changedInputs.length > 0) {
    return {
      changedInputs,
      currentVersions,
      previousVersions,
      reason: "recipe-changed",
      shouldPublish: true,
    };
  }

  return {
    changedInputs: [],
    currentVersions,
    previousVersions,
    reason: "no-publish-input-change",
    shouldPublish: false,
  };
}

function writeOutputs({ outputPath, result }) {
  const lines = [
    `reason=${result.reason}`,
    `should_publish=${result.shouldPublish}`,
  ];

  // Multiline output keeps the workflow logs readable when recipe changes fan out.
  if (result.changedInputs.length > 0) {
    lines.push("changed_inputs<<__CHANGED_INPUTS__");
    lines.push(...result.changedInputs);
    lines.push("__CHANGED_INPUTS__");
  } else {
    lines.push("changed_inputs=");
  }

  if (result.currentVersions) {
    lines.push(`current_versions=${JSON.stringify(result.currentVersions)}`);
  }

  if (result.previousVersions) {
    lines.push(`previous_versions=${JSON.stringify(result.previousVersions)}`);
  }

  appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      before: {
        type: "string",
      },
      event: {
        type: "string",
      },
      head: {
        type: "string",
      },
      output: {
        type: "string",
      },
      repo: {
        type: "string",
      },
    },
  });

  const result = decidePublish({
    beforeRef: values.before,
    eventName: values.event,
    headRef: values.head,
    repoRoot: values.repo,
  });

  if (values.output) {
    writeOutputs({ outputPath: values.output, result });
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
