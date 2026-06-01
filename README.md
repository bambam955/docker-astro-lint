# docker-astro-lint

[![CI](https://github.com/bambam955/docker-astro-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/bambam955/docker-astro-lint/actions/workflows/ci.yml)
[![GHCR](https://img.shields.io/badge/GHCR-docker--astro--lint-2496ED?logo=docker&logoColor=white)](https://github.com/bambam955/docker-astro-lint/pkgs/container/docker-astro-lint)

Docker image definitions and release automation for a toolbox-style Astro static
analysis image.

The repository builds and publishes a pinned Astro linting toolbox image for
use in CI jobs, pre-merge checks, and local repository validation. The default
published image is the Debian slim variant, with an explicit Alpine variant for
callers that prefer a smaller musl-based base image.

## Overview

The image bundles a fixed set of static-analysis tools behind one reproducible
container image so CI pipelines do not need to resolve tool versions on every
run. The repository also carries a small fixture project plus smoke tests so
each release is validated against real Astro project commands before it is
pushed to GHCR.

## Included tools

The image ships pinned versions of:

- `astro`
- `@astrojs/check`
- `eslint`
- `prettier`
- `prettier-astro` convenience wrapper
- `vitest`
- `playwright`
- `linkinator`
- `markdownlint-cli2`
- `lychee`

## Published tags

Images are published to GHCR with tags derived from the pinned Astro version:

- Debian slim is the default image family:
  - `ghcr.io/<owner>/docker-astro-lint:<astro-version>`
  - `ghcr.io/<owner>/docker-astro-lint:<astro-major>.<astro-minor>`
  - `ghcr.io/<owner>/docker-astro-lint:<astro-major>`
  - `ghcr.io/<owner>/docker-astro-lint:latest`
- Alpine keeps an explicit suffix:
  - `ghcr.io/<owner>/docker-astro-lint:<astro-version>-alpine`
  - `ghcr.io/<owner>/docker-astro-lint:<astro-major>.<astro-minor>-alpine`
  - `ghcr.io/<owner>/docker-astro-lint:<astro-major>-alpine`
  - `ghcr.io/<owner>/docker-astro-lint:latest-alpine`

This image family currently targets `node:24` and Linux `amd64`.

The slim image family owns the unsuffixed tags, so
`ghcr.io/<owner>/docker-astro-lint:latest` resolves to the Debian slim image.
Use the `-alpine` suffix when you explicitly want the Alpine variant.

## Automation

The repository has three GitHub Actions workflows:

- `ci`: runs `npm test` and smoke-tests both bake targets on pull requests and
  pushes to `main`
- `publish`: rebuilds and publishes the image only when the pinned Astro
  version or image recipe inputs change
- `update-astro`: checks for a newer pinned Astro release and opens a pull
  request with refreshed manifests and lockfiles

The publish workflow uses `scripts/decide-publish.mjs` to avoid republishing
when docs-only or unrelated repository changes land on `main`.

## Local build

Both the local recipes and the publish workflow build through
[`docker buildx bake`](https://docs.docker.com/build/bake/) so the Dockerfile
selection, shared build args, and image tagging rules stay in one place.

The shared bake definition in [`docker-bake.hcl`](./docker-bake.hcl) is the
single source of truth for:

- Dockerfile selection per variant
- shared build arguments such as the pinned `LYCHEE_VERSION`
- local validation image tags
- the Linux `amd64` target platform used by publish

The easiest local workflow is through `just`:

```bash
just build
just run
just smoke
just smoke alpine
```

The recipes default to the `slim` variant. Pass `alpine` as the positional
variant argument to use the other bake target.

If you want to run the steps manually, install the pinned tool manifest and the
fixture dependencies first:

```bash
npm ci
cd fixtures/test-site && npm ci
```

Build a local image directly with bake:

```bash
ASTRO_VERSION="$(node ./scripts/print-astro-version.mjs)" docker buildx bake slim --load
```

Render the resolved bake target without building it:

```bash
docker buildx bake --print slim
```

Run the smoke test against a built image:

```bash
./scripts/smoke-test-image.sh docker-astro-lint:$(node ./scripts/print-astro-version.mjs)-slim
```

## Usage

The container is designed to run against an already-installed Astro project
mounted at `/workspace`. It does not install the target project dependencies on
your behalf.

Mount an Astro project into `/workspace` and invoke the desired CLI directly:

```bash
docker run --rm -it \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  ghcr.io/<owner>/docker-astro-lint:<astro-version> \
  prettier-astro --check src/**/*.astro
```

The mounted project is expected to already contain its own dependencies.
Passing the host UID/GID is recommended for commands like `astro check` that
write cache files into the mounted repository.

Common examples:

```bash
docker run --rm -it \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  ghcr.io/<owner>/docker-astro-lint:latest \
  astro check
```

```bash
docker run --rm -it \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/workspace" \
  ghcr.io/<owner>/docker-astro-lint:latest-alpine \
  lychee README.md
```

## Maintenance Notes

When you change image build logic, keep these files in sync:

- [`docker-bake.hcl`](./docker-bake.hcl) for shared build definitions
- [`Dockerfile.slim`](./Dockerfile.slim) and [`Dockerfile.alpine`](./Dockerfile.alpine) for variant-specific image behavior
- [`scripts/decide-publish.mjs`](./scripts/decide-publish.mjs) if the publish inputs change
- [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) if the release flow needs different validation or publish behavior
