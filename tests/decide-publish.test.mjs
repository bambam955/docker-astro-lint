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

function writeAstroVersions(repoRoot, versions) {
  writeJson(path.join(repoRoot, "astro-versions.json"), {
    versions,
  });
}

function writeTrackedManifestPair(repoRoot, manifestRoot, version) {
  writeJson(path.join(repoRoot, manifestRoot, version, "package.json"), {
    dependencies: {
      astro: version,
    },
  });
  writeRepoFile(
    repoRoot,
    path.join(manifestRoot, version, "package-lock.json"),
    "{\n}\n",
  );
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

  writeAstroVersions(repoRoot, ["1.0.0"]);
  writeTrackedManifestPair(repoRoot, "manifests/tools", "1.0.0");
  writeTrackedManifestPair(repoRoot, "manifests/fixtures", "1.0.0");
  writeRepoFile(repoRoot, "Dockerfile.slim", "FROM node:24-slim\n");
  writeRepoFile(repoRoot, "Dockerfile.alpine", "FROM node:24-alpine\n");
  writeRepoFile(repoRoot, "docker-bake.hcl", "group \"default\" {\n  targets = [\"slim\"]\n}\n");
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

test("publishes when the configured Astro version set changed in any commit in the push", () => {
  const { baseRef, repoRoot } = createRepo();

  writeAstroVersions(repoRoot, ["2.0.0", "1.0.0"]);
  commitAll(repoRoot, "expand astro support");

  writeRepoFile(repoRoot, "README.md", "# unrelated follow-up\n");
  const headRef = commitAll(repoRoot, "touch docs");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "astro-versions-changed");
  assert.deepEqual(result.previousVersions, ["1.0.0"]);
  assert.deepEqual(result.currentVersions, ["2.0.0", "1.0.0"]);
});

test("publishes when the previous revision predates the managed version set", () => {
  const { baseRef, repoRoot } = createEmptyRepo();

  writeAstroVersions(repoRoot, ["1.0.0"]);
  writeTrackedManifestPair(repoRoot, "manifests/tools", "1.0.0");
  writeTrackedManifestPair(repoRoot, "manifests/fixtures", "1.0.0");
  writeRepoFile(repoRoot, "Dockerfile.slim", "FROM node:24-slim\n");
  writeRepoFile(repoRoot, "Dockerfile.alpine", "FROM node:24-alpine\n");
  writeRepoFile(repoRoot, "docker-bake.hcl", "group \"default\" {\n  targets = [\"slim\"]\n}\n");
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
  assert.deepEqual(result.currentVersions, ["1.0.0"]);
  assert.equal(result.previousVersions, null);
  assert.deepEqual(result.changedInputs, [
    ".github/workflows/publish.yml",
    "Dockerfile.alpine",
    "Dockerfile.slim",
    "docker-bake.hcl",
    "manifests/fixtures/1.0.0/package-lock.json",
    "manifests/fixtures/1.0.0/package.json",
    "manifests/tools/1.0.0/package-lock.json",
    "manifests/tools/1.0.0/package.json",
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

test("publishes when the tracked manifest directories changed without a version-set bump", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(
    repoRoot,
    "manifests/tools/1.0.0/package-lock.json",
    "{\n  \"updated\": true\n}\n",
  );
  const headRef = commitAll(repoRoot, "refresh tracked manifest");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.deepEqual(result.changedInputs, ["manifests/tools/1.0.0/package-lock.json"]);
});

test("publishes when the bake definition changed without an Astro version bump", () => {
  const { baseRef, repoRoot } = createRepo();

  writeRepoFile(
    repoRoot,
    "docker-bake.hcl",
    "group \"default\" {\n  targets = [\"slim\", \"alpine\"]\n}\n",
  );
  const headRef = commitAll(repoRoot, "adjust bake targets");

  const result = decidePublish({
    beforeRef: baseRef,
    eventName: "push",
    headRef,
    repoRoot,
  });

  assert.equal(result.shouldPublish, true);
  assert.equal(result.reason, "recipe-changed");
  assert.deepEqual(result.changedInputs, ["docker-bake.hcl"]);
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

test("skips publish when neither the Astro version set nor publish inputs changed", () => {
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
