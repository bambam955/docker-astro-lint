set shell := ["bash", "-euo", "pipefail", "-c"]

image_name := "docker-astro-lint"
astro_version := `node ./scripts/print-astro-version.mjs`

default:
  @just --list

# Build a local image for one of the supported Dockerfile variants.
build variant="slim":
  ASTRO_VERSION="{{astro_version}}" IMAGE_NAME="{{image_name}}" docker buildx bake "{{variant}}" --load

# Open an interactive shell in the local image with the repo mounted at /workspace.
run variant="slim":
  docker run --rm -it --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace "{{image_name}}:{{astro_version}}-{{variant}}" /bin/sh

# Reinstall local dependencies, rebuild the image, and run the smoke test script.
smoke variant="slim":
  npm ci
  (cd fixtures/test-site && npm ci)
  ASTRO_VERSION="{{astro_version}}" IMAGE_NAME="{{image_name}}" docker buildx bake "{{variant}}" --load
  ./scripts/smoke-test-image.sh "{{image_name}}:{{astro_version}}-{{variant}}"
