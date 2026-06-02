# Repository Guidelines

## Project Structure & Module Organization
Top-level Docker build inputs live in `Dockerfile.slim`, `Dockerfile.alpine`, and `docker-bake.hcl`. Node-based maintenance utilities live in `scripts/*.mjs`, including publish gating and Astro version updates. Tests for those utilities live in `tests/*.test.mjs` and run with Node's built-in test runner. The `fixtures/test-site/` directory is a real Astro fixture used by smoke tests, so keep its manifests and sample source in sync with image behavior. GitHub automation lives in `.github/workflows/`.

## Build, Test, and Development Commands
Run `npm ci` to install the pinned tool manifest for local script and test work. Run `npm test` to execute all `node --test` suites in `tests/`. Use `npm run astro:version` to print the currently pinned Astro version, and `npm run update:astro` to refresh the pinned version data. For container work, prefer `just build`, `just run`, and `just smoke`; pass `alpine` to target the Alpine variant, for example `just smoke alpine`.

## Coding Style & Naming Conventions
Use ES modules for Node scripts and keep new automation in `scripts/` with descriptive kebab-case names such as `print-image-tags.mjs`. Match the existing style: 2-space indentation, double quotes in JavaScript, and small single-purpose functions. Add concise comments when behavior is not obvious, especially around Git, Docker, or workflow edge cases. Test files should mirror the script they cover, for example `tests/decide-publish.test.mjs`.

## Testing Guidelines
Add or update `node:test` coverage for any change to `scripts/*.mjs`. Prefer targeted unit tests for decision logic and keep fixture-based validation for image behavior in `scripts/smoke-test-image.sh`. When Docker-related logic changes, run `just smoke` for the affected variant before opening a PR.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, `refactor:`, and `ci:`. Keep commit subjects short, imperative, and scoped to one change. Pull requests should explain the behavior change, list validation performed (`npm test`, `just smoke`, etc.), and mention whether publish inputs, image tags, or workflows were affected. Screenshots are generally unnecessary for this infrastructure-focused repository.
