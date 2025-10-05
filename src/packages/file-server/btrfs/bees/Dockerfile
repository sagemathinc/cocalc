# ===== Build stage: compile bees from source =====
FROM debian:stable-slim AS build

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git build-essential autotools-dev autoconf libtool pkg-config \
    libxxhash-dev libzstd-dev zlib1g-dev liblz4-dev libacl1-dev libbtrfs-dev \
    && rm -rf /var/lib/apt/lists/*

# Build bees
WORKDIR /src
RUN git clone --depth=1 https://github.com/Zygo/bees.git
WORKDIR /src/bees
RUN make -j"$(nproc)" && make install DESTDIR=/out

# ===== Runtime stage: minimal tools + bees =====
FROM debian:stable-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Tools we need at runtime:
#  - btrfs-progs: subvolume ops, introspection
#  - util-linux: chattr, flock, etc.
#  - xz-utils, coreutils, findutils: helpers
#  - cpulimit: CPU throttling inside the container (supplemental to cgroups)
RUN apt-get update && apt-get install -y --no-install-recommends \
    btrfs-progs util-linux xz-utils coreutils findutils procps cpulimit \
    && rm -rf /var/lib/apt/lists/*

# Copy bees binaries from build stage
COPY --from=build /out/ /

# Entrypoint script
COPY run-bees.sh /usr/local/bin/run-bees
RUN chmod +x /usr/local/bin/run-bees

# Default envs (can all be overridden at runtime)
ENV FS_PATH=/fs \
    BEESHOME_NAME=.beeshome \
    HASH_TABLE_SIZE=256M \
    MAX_CPU_PERCENT=100 \
    NICE=10 \
    IONICE_CLASS=3 \
    BEES_ARGS="-a"

# We run as root because bees needs CAP_SYS_ADMIN/ioctls on Btrfs.
ENTRYPOINT ["/usr/local/bin/run-bees"]
