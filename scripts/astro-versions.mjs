import { readFileSync } from "node:fs";

const stableVersionPattern = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/;
const defaultConfigPath = new URL("../astro-versions.json", import.meta.url);

export function parseAstroVersion(version) {
  const match = stableVersionPattern.exec(version);

  if (!match?.groups) {
    throw new Error(
      `Expected a stable Astro version in major.minor.patch form, received "${version}".`,
    );
  }

  const parsed = {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
  };

  return {
    ...parsed,
    majorMinor: `${parsed.major}.${parsed.minor}`,
    normalized: `${parsed.major}.${parsed.minor}.${parsed.patch}`,
  };
}

export function compareAstroVersions(leftVersion, rightVersion) {
  const left = parseAstroVersion(leftVersion);
  const right = parseAstroVersion(rightVersion);

  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

export function validateAstroVersions(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("Expected astro-versions.json to contain a non-empty versions array.");
  }

  const normalizedVersions = [];
  const seenExactVersions = new Set();
  const seenMinorLines = new Set();

  for (const version of versions) {
    const parsed = parseAstroVersion(version);

    if (seenExactVersions.has(parsed.normalized)) {
      throw new Error(`Duplicate Astro version "${parsed.normalized}" is not allowed.`);
    }

    if (seenMinorLines.has(parsed.majorMinor)) {
      throw new Error(
        `Duplicate Astro minor line "${parsed.majorMinor}.x" is not allowed.`,
      );
    }

    seenExactVersions.add(parsed.normalized);
    seenMinorLines.add(parsed.majorMinor);
    normalizedVersions.push(parsed.normalized);
  }

  for (let index = 1; index < normalizedVersions.length; index += 1) {
    const previousVersion = normalizedVersions[index - 1];
    const currentVersion = normalizedVersions[index];

    if (compareAstroVersions(previousVersion, currentVersion) <= 0) {
      throw new Error(
        `Astro versions must be ordered newest-to-oldest. "${currentVersion}" cannot follow "${previousVersion}".`,
      );
    }
  }

  return normalizedVersions;
}

export function readAstroVersions(configPath = defaultConfigPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  if (!config || typeof config !== "object" || !("versions" in config)) {
    throw new Error("Expected astro-versions.json to contain a versions array.");
  }

  return validateAstroVersions(config.versions);
}

export function getPrimaryAstroVersion(versions = readAstroVersions()) {
  return versions[0];
}

export function getConfiguredMinorLines(versions = readAstroVersions()) {
  return versions.map((version) => parseAstroVersion(version).majorMinor);
}

export function getRollingTagOwnership({
  version,
  versions = readAstroVersions(),
}) {
  const validatedVersions = validateAstroVersions(versions);
  const normalizedVersion = parseAstroVersion(version).normalized;

  if (!validatedVersions.includes(normalizedVersion)) {
    throw new Error(
      `Astro version "${normalizedVersion}" is not configured in astro-versions.json.`,
    );
  }

  const { major } = parseAstroVersion(normalizedVersion);
  const majorOwner = validatedVersions.find(
    (configuredVersion) => parseAstroVersion(configuredVersion).major === major,
  );

  return {
    ownsLatest: validatedVersions[0] === normalizedVersion,
    ownsMajor: majorOwner === normalizedVersion,
  };
}
