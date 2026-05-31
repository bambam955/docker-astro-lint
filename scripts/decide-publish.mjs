import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const publishInputPaths = [
  ".github/workflows/publish.yml",
  "Dockerfile.alpine",
  "Dockerfile.slim",
  "docker-bake.hcl",
  "fixtures/test-site/package-lock.json",
  "fixtures/test-site/package.json",
  "package-lock.json",
  "package.json",
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

function readPinnedAstroVersion({ repoRoot, revision, allowMissing = false }) {
  // Older revisions can predate the tool manifest entirely. Treat that as
  // "no previous pinned version" so the caller can fall back to path diffs.
  if (
    allowMissing &&
    !hasFileAtRevision({ filePath: "package.json", repoRoot, revision })
  ) {
    return null;
  }

  const packageJson = JSON.parse(
    runGit(["show", `${revision}:package.json`], { repoRoot }),
  );
  const astroVersion = packageJson.dependencies?.astro;

  if (!astroVersion) {
    throw new Error(`The package.json at ${revision} is missing a pinned astro dependency.`);
  }

  return astroVersion;
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
      currentVersion: null,
      previousVersion: null,
      reason: "manual-dispatch",
      shouldPublish: true,
    };
  }

  // GitHub uses the all-zero SHA when a push does not have a stable prior tip.
  if (isMissingRevision(beforeRef) || !hasCommit({ repoRoot, revision: beforeRef })) {
    return {
      changedInputs: [],
      currentVersion: null,
      previousVersion: null,
      reason: "missing-before-revision",
      shouldPublish: true,
    };
  }

  const currentVersion = readPinnedAstroVersion({ repoRoot, revision: headRef });
  const previousVersion = readPinnedAstroVersion({
    allowMissing: true,
    repoRoot,
    revision: beforeRef,
  });

  if (previousVersion && currentVersion !== previousVersion) {
    return {
      changedInputs: [],
      currentVersion,
      previousVersion,
      reason: "astro-version-changed",
      shouldPublish: true,
    };
  }

  const changedInputs = listChangedPublishInputs({ repoRoot, beforeRef, headRef });

  if (changedInputs.length > 0) {
    return {
      changedInputs,
      currentVersion,
      previousVersion,
      reason: "recipe-changed",
      shouldPublish: true,
    };
  }

  return {
    changedInputs: [],
    currentVersion,
    previousVersion,
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

  if (result.currentVersion) {
    lines.push(`current_version=${result.currentVersion}`);
  }

  if (result.previousVersion) {
    lines.push(`previous_version=${result.previousVersion}`);
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
