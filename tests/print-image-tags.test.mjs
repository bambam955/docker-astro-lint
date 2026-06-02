import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBakeOverride,
  buildImageTags,
  formatTags,
} from "../scripts/print-image-tags.mjs";

const configuredVersions = [
  "6.4.2",
  "6.3.8",
  "6.2.2",
  "6.1.10",
  "6.0.8",
  "5.17.1",
  "5.16.16",
  "5.15.9",
  "5.14.8",
];

test("builds unsuffixed default tags for the slim image family", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "slim",
    version: "6.4.2",
    versions: configuredVersions,
  });

  assert.deepEqual(tags, [
    "ghcr.io/example/docker-astro-lint:6.4.2",
    "ghcr.io/example/docker-astro-lint:6.4",
    "ghcr.io/example/docker-astro-lint:6",
    "ghcr.io/example/docker-astro-lint:latest",
  ]);
});

test("builds explicit alpine tags for the alpine image family", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "alpine",
    version: "6.4.2",
    versions: configuredVersions,
  });

  assert.deepEqual(tags, [
    "ghcr.io/example/docker-astro-lint:6.4.2-alpine",
    "ghcr.io/example/docker-astro-lint:6.4-alpine",
    "ghcr.io/example/docker-astro-lint:6-alpine",
    "ghcr.io/example/docker-astro-lint:latest-alpine",
  ]);
});

test("omits major and latest tags when another version owns those rolling aliases", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "slim",
    version: "6.3.8",
    versions: configuredVersions,
  });

  assert.deepEqual(tags, [
    "ghcr.io/example/docker-astro-lint:6.3.8",
    "ghcr.io/example/docker-astro-lint:6.3",
  ]);
});

test("keeps major ownership on the newest configured patch in an older major line", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "slim",
    version: "5.17.1",
    versions: configuredVersions,
  });

  assert.deepEqual(tags, [
    "ghcr.io/example/docker-astro-lint:5.17.1",
    "ghcr.io/example/docker-astro-lint:5.17",
    "ghcr.io/example/docker-astro-lint:5",
  ]);
});

test("rejects unsupported image variants", () => {
  assert.throws(
    () =>
      buildImageTags({
        imageName: "ghcr.io/example/docker-astro-lint",
        variant: "distroless",
        version: "6.4.2",
        versions: configuredVersions,
      }),
    /Unsupported image variant "distroless"\./,
  );
});

test("rejects versions that cannot produce major and minor rolling tags", () => {
  assert.throws(
    () =>
      buildImageTags({
        imageName: "ghcr.io/example/docker-astro-lint",
        variant: "slim",
        version: "6.4.2-beta.1",
        versions: configuredVersions,
      }),
    /Expected a stable Astro version in major\.minor\.patch form/,
  );
});

test("rejects versions outside the configured support set", () => {
  assert.throws(
    () =>
      buildImageTags({
        imageName: "ghcr.io/example/docker-astro-lint",
        variant: "slim",
        version: "6.5.1",
        versions: configuredVersions,
      }),
    /Astro version "6\.5\.1" is not configured/,
  );
});

test("formats tags as a bake-friendly CSV string", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "alpine",
    version: "6.4.2",
    versions: configuredVersions,
  });

  assert.equal(
    formatTags({ format: "csv", tags }),
    "ghcr.io/example/docker-astro-lint:6.4.2-alpine,ghcr.io/example/docker-astro-lint:6.4-alpine,ghcr.io/example/docker-astro-lint:6-alpine,ghcr.io/example/docker-astro-lint:latest-alpine",
  );
});

test("rejects unsupported output formats", () => {
  assert.throws(
    () =>
      formatTags({
        format: "json",
        tags: ["ghcr.io/example/docker-astro-lint:6.4.2"],
      }),
    /Unsupported output format "json"\./,
  );
});

test("builds a bake override file for multi-tag publishes", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "slim",
    version: "6.4.2",
    versions: configuredVersions,
  });

  assert.equal(
    buildBakeOverride({ target: "slim", tags }),
    JSON.stringify(
      {
        target: {
          slim: {
            tags,
          },
        },
      },
      null,
      2,
    ),
  );
});

test("rejects bake overrides without a target name", () => {
  assert.throws(
    () => buildBakeOverride({ target: "", tags: ["ghcr.io/example/image:latest"] }),
    /Missing required bake target name\./,
  );
});
