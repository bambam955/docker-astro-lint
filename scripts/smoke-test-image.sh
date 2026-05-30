#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <image-ref>" >&2
  exit 1
fi

image_ref="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_dir="${repo_root}/fixtures/test-site"
runtime_user="$(id -u):$(id -g)"

if [[ ! -d "${fixture_dir}/node_modules" ]]; then
  echo "fixture dependencies are missing; run 'cd fixtures/test-site && npm ci' first" >&2
  exit 1
fi

# These direct version checks verify that every expected CLI is on PATH inside
# the container before we exercise them against a mounted Astro project.
if [[ "$(docker run --rm "${image_ref}" id -u)" == "0" ]]; then
  echo "image is unexpectedly running as root by default" >&2
  exit 1
fi

docker run --rm "${image_ref}" astro --version
docker run --rm "${image_ref}" eslint --version
docker run --rm "${image_ref}" prettier --version
docker run --rm "${image_ref}" prettier-astro --version
docker run --rm "${image_ref}" markdownlint-cli2 --version
docker run --rm "${image_ref}" lychee --version

# The fixture keeps its own dependencies outside the image because the image is
# intentionally just a toolbox and not a project bootstrap environment. The
# mounted commands use the caller's UID/GID so Astro can write its cache files
# into the mounted project without permission mismatches.
docker run --rm --user "${runtime_user}" -v "${fixture_dir}:/workspace" -w /workspace "${image_ref}" astro check
docker run --rm --user "${runtime_user}" -v "${fixture_dir}:/workspace" -w /workspace "${image_ref}" eslint src/example.js
docker run --rm --user "${runtime_user}" -v "${fixture_dir}:/workspace" -w /workspace "${image_ref}" prettier-astro --check README.md eslint.config.mjs src/example.js src/pages/index.astro tsconfig.json
docker run --rm --user "${runtime_user}" -v "${fixture_dir}:/workspace" -w /workspace "${image_ref}" markdownlint-cli2 README.md
docker run --rm --user "${runtime_user}" -v "${fixture_dir}:/workspace" -w /workspace "${image_ref}" lychee --offline README.md
