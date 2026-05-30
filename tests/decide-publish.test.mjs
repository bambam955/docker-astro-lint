import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { decidePublish } from "../scripts/decide-publish.mjs";

function runGit(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeRepoFile(repoRoot, relativePath, content) {
  const absolutePath = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function updatePinnedAstroVersion(repoRoot, version) {
  writeJson(path.join(repoRoot, "package.json"), {
    dependencies: {
      astro: version,
    },
  });
  writeJson(path.join(repoRoot, "fixtures/test-site/package.json"), {
    dependencies: {
      astro: version,
    },
  });
}

function commitAll(repoRoot, message) {
  runGit(repoRoot, ["add", "-A"]);
  runGit(repoRoot, ["commit", "-m", message]);
  return runGit(repoRoot, ["rev-parse", "HEAD"]);
}

function createRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "decide-publish-"));

  runGit(repoRoot, ["init", "--initial-branch=main"]);
  runGit(repoRoot, ["config", "user.name", "Codex"]);
  runGit(repoRoot, ["config", "user.email", "codex@example.com"]);

  updatePinnedAstroVersion(repoRoot, "1.0.0");
  writeRepoFile(repoRoot, "package-lock.json", "{\n}\n");
  writeRepoFile(repoRoot, "fixtures/test-site/package-lock.json", "{\n}\n");
  writeRepoFile(repoRoot, "Dockerfile.slim", "FROM node:24-slim\n");
  writeRepoFile(repoRoot, "Dockerfile.alpine", "FROM node:24-alpine\n");
  writeRepoFile(repoRoot, "scripts/smoke-test-image.sh", "#!/bin/sh\nexit 0\n");
  writeRepoFile(
    repoRoot,
    ".github/workflows/publish.yml",
    "lychee_version: 0.24.2\n",
  );
  writeRepoFile(repoRoot, "README.md", "# fixture\n");

  const baseRef = commitAll(repoRoot, "base");

  return { baseRef, repoRoot };
}

function createEmptyRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "decide-publish-empty-"));

  runGit(repoRoot, ["init", "--initial-branch=main"]);
  runGit(repoRoot, ["config", "user.name", "Codex"]);
  runGit(repoRoot, ["config", "user.email", "codex@example.com"]);

  writeRepoFile(repoRoot, "README.md", "# bootstrap\n");
  const baseRef = commitAll(repoRoot, "bootstrap");

  return { baseRef, repoRoot };
}

test("publishes when a manual dispatch requests it", () => {
  const result = decidePublish({
    beforeRef: "",
    eventName: "workflow_dispatch",
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "manual-dispatch");
});

test("publishes when the Astro version changed in any commit in the push", () => {
  const { baseRef, repoRoot } = createRepo();

  updatePinnedAstroVersion(repoRoot, "2.0.0");
  commitAll(repoRoot, "bump astro");

  writeRepoFile(repoRoot, "README.md", "# unrelated follow-up\n");
  const headRef = commitAll(repoRoot, "touch docs");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "astro-version-changed");
  assert.equal(result.previousVersion, "1.0.0");
  assert.equal(result.currentVersion, "2.0.0");
});

test("publishes when the previous revision predates the tool manifest", () => {
  const { baseRef, repoRoot } = createEmptyRepo();

  updatePinnedAstroVersion(repoRoot, "1.0.0");
  writeRepoFile(repoRoot, "package-lock.json", "{\n}\n");
  writeRepoFile(repoRoot, "fixtures/test-site/package-lock.json", "{\n}\n");
  writeRepoFile(repoRoot, "Dockerfile.slim", "FROM node:24-slim\n");
  writeRepoFile(repoRoot, "Dockerfile.alpine", "FROM node:24-alpine\n");
  writeRepoFile(repoRoot, "scripts/smoke-test-image.sh", "#!/bin/sh\nexit 0\n");
  writeRepoFile(
    repoRoot,
    ".github/workflows/publish.yml",
    "lychee_version: 0.24.2\n",
  );
  const headRef = commitAll(repoRoot, "add publish inputs");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.equal(result.currentVersion, "1.0.0");
  assert.equal(result.previousVersion, null);
  assert.deepEqual(result.changedInputs, [
    ".github/workflows/publish.yml",
    "Dockerfile.alpine",
    "Dockerfile.slim",
    "fixtures/test-site/package-lock.json",
    "fixtures/test-site/package.json",
    "package-lock.json",
    "package.json",
    "scripts/smoke-test-image.sh",
  ]);
});

test("publishes when a Dockerfile changed without an Astro version bump", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(repoRoot, "Dockerfile.slim", "FROM node:24-slim\nRUN echo slim\n");
  const headRef = commitAll(repoRoot, "tune slim image");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.deepEqual(result.changedInputs, ["Dockerfile.slim"]);
});

test("publishes when the smoke test recipe changed without an Astro version bump", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(repoRoot, "scripts/smoke-test-image.sh", "#!/bin/sh\necho smoke\n");
  const headRef = commitAll(repoRoot, "adjust smoke test");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.deepEqual(result.changedInputs, ["scripts/smoke-test-image.sh"]);
});

test("publishes when the workflow build inputs changed without an Astro version bump", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(
    repoRoot,
    ".github/workflows/publish.yml",
    "lychee_version: 0.25.0\n",
  );
  const headRef = commitAll(repoRoot, "bump lychee version");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.deepEqual(result.changedInputs, [".github/workflows/publish.yml"]);
});

test("skips publish when neither Astro nor publish inputs changed", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(repoRoot, "README.md", "# docs only\n");
  const headRef = commitAll(repoRoot, "docs");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, false);
  assert.equal(result.reason, "no-publish-input-change");
  assert.deepEqual(result.changedInputs, []);
});

test("publishes when the pre-push revision is unavailable", () => {
  const { repoRoot } = createRepo();

  const result = decidePublish({
    beforeRef: "0000000000000000000000000000000000000000",
    eventName: "push",
    headRef: "HEAD",
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "missing-before-revision");
});
