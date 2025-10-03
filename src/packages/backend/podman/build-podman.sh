#!/usr/bin/env bash
set -ev

# This is a script that will install deps and build a specific version of podman
# from source on Ubuntu and set it up properly integrated with the OS, and also
# you can easily switch between this and the official version.
# It works.   I'm putting this here since I don't know where else to put it,
# and it'll likely be useful for building a container image for deployment
# of project runners on Kubernetes.   I don't intend to depend on any latest
# features of podman, but it's good to have the many latest bugfixes as an option!

# === Settings ================================================================
PODMAN_VERSION="${PODMAN_VERSION:-v5.6.2}"
PREFIX="/opt/podman-${PODMAN_VERSION#v}"   # /opt/podman-5.6.2
MAKEFLAGS="${MAKEFLAGS:- -j$(nproc)}"
BUILDTAGS="${BUILDTAGS:-seccomp apparmor}"

# === Pre-flight ==============================================================
if [[ $EUID -ne 0 ]]; then
  echo "Please run as root: sudo $0" >&2
  exit 1
fi

# Basic build deps + runtime helpers from Ubuntu
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git make golang-go gcc g++ pkg-config \
  libseccomp-dev libapparmor-dev \
  uidmap iptables \
  conmon slirp4netns fuse-overlayfs \
  runc crun \
  bash-completion \
  libbtrfs-dev \
  libgpgme-dev libassuan-dev libgpg-error-dev \
  libsystemd-dev

# Sanity: Go version (Podman 5.x works with Go >=1.20; Ubuntu 25.04 has 1.22)
go version

# === Build Podman from source ===============================================
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

cd "$TMP"
git clone --branch "$PODMAN_VERSION" --depth 1 https://github.com/containers/podman.git
cd podman

# Build
echo "Building Podman ${PODMAN_VERSION} with BUILDTAGS='${BUILDTAGS}'..."
make ${MAKEFLAGS} BUILDTAGS="${BUILDTAGS}"

# Stage install tree under $PREFIX
echo "Installing into ${PREFIX} ..."
install -d "${PREFIX}/bin" "${PREFIX}/share/bash-completion/completions" "${PREFIX}/share/zsh/site-functions" "${PREFIX}/share/fish/vendor_completions.d"

# Install the podman binary only (use Ubuntu's helpers for the rest)
install -m 0755 bin/podman "${PREFIX}/bin/podman"

# Shell completions
# Bash
if [[ -f completions/bash/podman ]]; then
  install -m 0644 completions/bash/podman "${PREFIX}/share/bash-completion/completions/podman"
fi
# Zsh
if [[ -f completions/zsh/_podman ]]; then
  install -m 0644 completions/zsh/_podman "${PREFIX}/share/zsh/site-functions/_podman"
fi
# Fish
if [[ -f completions/fish/podman.fish ]]; then
  install -m 0644 completions/fish/podman.fish "${PREFIX}/share/fish/vendor_completions.d/podman.fish"
fi

# Convenience symlink in /usr/local/bin
install -d /usr/local/bin
ln -sf "${PREFIX}/bin/podman" /usr/local/bin/podman-${PODMAN_VERSION#v}

# === Alternatives switcher ===================================================
# Register distro podman (if not already registered)
if ! update-alternatives --query podman >/dev/null 2>&1; then

    # 1) Make a distinct target for the distro binary
    mv /usr/bin/podman /usr/local/bin/podman-apt

    # 2) Reset any half-created “podman” group (ignore errors)
    update-alternatives --remove-all podman 2>/dev/null || true

    # 3) Register both alternatives (note: link=/usr/bin/podman; targets are distinct files)
    update-alternatives --install /usr/bin/podman podman /usr/local/bin/podman-apt     10
    update-alternatives --install /usr/bin/podman podman /usr/local/bin/podman-5.6.2   20
fi

# update-alternatives --config podman

# === Show status =============================================================
echo
echo "Installed ${PODMAN_VERSION} to ${PREFIX}"
echo "Added /usr/local/bin/podman-${PODMAN_VERSION#v} symlink."
echo
echo "Current alternatives:"
update-alternatives --display podman || true
echo
echo "To switch versions interactively:"
echo "  sudo update-alternatives --config podman"
echo
echo "Active podman version:"
/usr/bin/podman --version || true
echo
echo "Done."
