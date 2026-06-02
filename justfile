set shell := ["bash", "-euo", "pipefail", "-c"]

image_name := "docker-astro-lint"
default_astro_version := `node ./scripts/print-astro-version.mjs`

default:
  @just --list

# Build a local image for one of the supported Dockerfile variants.
build variant="slim" astro_version=default_astro_version:
  ASTRO_VERSION="{{astro_version}}" IMAGE_NAME="{{image_name}}" docker buildx bake "{{variant}}" --load

# Open an interactive shell in the local image with the repo mounted at /workspace.
run variant="slim" astro_version=default_astro_version:
  docker run --rm -it --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace "{{image_name}}:{{astro_version}}-{{variant}}" /bin/sh

# Build the selected image, prepare a matching fixture tree, and run smoke tests
# without mutating the tracked fixture manifest in the working tree.
smoke variant="slim" astro_version=default_astro_version:
  #!/usr/bin/env bash
  set -euo pipefail
  fixture_dir="$(mktemp -d)"
  trap 'rm -rf "$fixture_dir"' EXIT
  node ./scripts/prepare-smoke-fixture.mjs --version "{{astro_version}}" --output "$fixture_dir"
  (cd "$fixture_dir" && npm ci)
  ASTRO_VERSION="{{astro_version}}" IMAGE_NAME="{{image_name}}" docker buildx bake "{{variant}}" --load
  ./scripts/smoke-test-image.sh "{{image_name}}:{{astro_version}}-{{variant}}" "$fixture_dir"
