import assert from "node:assert/strict";
import test from "node:test";

import {
  getPrimaryAstroVersion,
  getRollingTagOwnership,
  validateAstroVersions,
} from "../scripts/astro-versions.mjs";

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

test("returns the configured versions when they are stable and ordered newest-to-oldest", () => {
  assert.deepEqual(validateAstroVersions(configuredVersions), configuredVersions);
});

test("returns the first configured version as the primary default", () => {
  assert.equal(getPrimaryAstroVersion(configuredVersions), "6.4.2");
});

test("rejects duplicate exact versions", () => {
  assert.throws(
    () => validateAstroVersions(["6.4.2", "6.4.2"]),
    /Duplicate Astro version "6\.4\.2" is not allowed\./,
  );
});

test("rejects duplicate minor lines", () => {
  assert.throws(
    () => validateAstroVersions(["6.4.2", "6.4.1"]),
    /Duplicate Astro minor line "6\.4\.x" is not allowed\./,
  );
});

test("rejects prerelease versions", () => {
  assert.throws(
    () => validateAstroVersions(["6.4.2-beta.1"]),
    /Expected a stable Astro version in major\.minor\.patch form/,
  );
});

test("rejects malformed versions", () => {
  assert.throws(
    () => validateAstroVersions(["6.4"]),
    /Expected a stable Astro version in major\.minor\.patch form/,
  );
});

test("rejects version sets that are not sorted newest-to-oldest", () => {
  assert.throws(
    () => validateAstroVersions(["6.3.8", "6.4.2"]),
    /Astro versions must be ordered newest-to-oldest/,
  );
});

test("reports rolling tag ownership for the latest v6 release", () => {
  assert.deepEqual(
    getRollingTagOwnership({
      version: "6.4.2",
      versions: configuredVersions,
    }),
    {
      ownsLatest: true,
      ownsMajor: true,
    },
  );
});

test("reports rolling tag ownership for the latest v5 release", () => {
  assert.deepEqual(
    getRollingTagOwnership({
      version: "5.17.1",
      versions: configuredVersions,
    }),
    {
      ownsLatest: false,
      ownsMajor: true,
    },
  );
});

test("rejects ownership checks for versions outside the configured support set", () => {
  assert.throws(
    () =>
      getRollingTagOwnership({
        version: "6.5.0",
        versions: configuredVersions,
      }),
    /Astro version "6\.5\.0" is not configured/,
  );
});
