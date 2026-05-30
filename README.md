# docker-astro-lint

Docker image definitions and release automation for a toolbox-style Astro static
analysis image.

## Included tools

The image ships pinned versions of:

- `astro`
- `@astrojs/check`
- `eslint`
- `prettier`
- `prettier-astro` convenience wrapper
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

## Local build

The easiest local workflow is through `just`:

```bash
just build
just run
just smoke
just smoke alpine
```

The recipes default to the `slim` variant. Pass `alpine` as the positional
variant argument to use the other Dockerfile.

If you want to run the steps manually, install the pinned tool manifest and the
fixture dependencies first:

```bash
npm ci
cd fixtures/test-site && npm ci
```

Run the smoke test against a built image:

```bash
./scripts/smoke-test-image.sh docker-astro-lint:$(node ./scripts/print-astro-version.mjs)-slim
```

## Usage

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
