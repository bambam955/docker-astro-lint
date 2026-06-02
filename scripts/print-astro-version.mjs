import { getPrimaryAstroVersion, readAstroVersions } from "./astro-versions.mjs";

process.stdout.write(getPrimaryAstroVersion(readAstroVersions()));
