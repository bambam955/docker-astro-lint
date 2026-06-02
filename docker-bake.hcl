variable "ASTRO_VERSION" {
  // The local workflow passes the pinned Astro version so the validation image
  // tag stays aligned with the release image tags.
  default = "dev"
}

variable "IMAGE_NAME" {
  // Local builds default to the repository image name while the publish
  // workflow overrides this with the fully-qualified GHCR repository.
  default = "docker-astro-lint"
}

variable "LYCHEE_VERSION" {
  // Keep the bake file as the single source of truth for the pinned lychee
  // artifact version used by both image variants.
  default = "0.24.2"
}

target "_common" {
  context = "."
  // BuildKit named contexts let each image build consume the tracked manifest
  // pair for the selected Astro version without rewriting repo files.
  contexts = {
    tool_manifest = "./manifests/tools/${ASTRO_VERSION}"
  }
  args = {
    LYCHEE_VERSION = LYCHEE_VERSION
  }
  platforms = ["linux/amd64"]
}

target "slim" {
  inherits = ["_common"]
  dockerfile = "Dockerfile.slim"
  tags = ["${IMAGE_NAME}:${ASTRO_VERSION}-slim"]
}

target "alpine" {
  inherits = ["_common"]
  dockerfile = "Dockerfile.alpine"
  tags = ["${IMAGE_NAME}:${ASTRO_VERSION}-alpine"]
}

group "default" {
  targets = ["slim"]
}

group "all" {
  targets = ["slim", "alpine"]
}
