import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBakeOverride,
  buildImageTags,
  formatTags,
} from "../scripts/print-image-tags.mjs";

test("builds unsuffixed default tags for the slim image family", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "slim",
    version: "6.4.2",
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
  });

  assert.deepEqual(tags, [
    "ghcr.io/example/docker-astro-lint:6.4.2-alpine",
    "ghcr.io/example/docker-astro-lint:6.4-alpine",
    "ghcr.io/example/docker-astro-lint:6-alpine",
    "ghcr.io/example/docker-astro-lint:latest-alpine",
  ]);
});

test("rejects unsupported image variants", () => {
  assert.throws(
    () =>
      buildImageTags({
        imageName: "ghcr.io/example/docker-astro-lint",
        variant: "distroless",
        version: "6.4.2",
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
      }),
    /Expected a stable Astro version in major\.minor\.patch form/,
  );
});

test("formats tags as a bake-friendly CSV string", () => {
  const tags = buildImageTags({
    imageName: "ghcr.io/example/docker-astro-lint",
    variant: "alpine",
    version: "6.4.2",
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
