FROM smc-hub-base

USER root

# Which commit to checkout and build.
ARG commit=HEAD

# Pull latest source code for SMC and checkout requested commit (or HEAD)
RUN cd /smc && git pull && git fetch origin && git checkout ${commit:-HEAD}

# Rebuild hub -- this uses npm to update any dependencies, or install anything required.
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub && \
  rm -rf /root/.npm /root/.node-gyp/

# Remove packages needed for the build above, which we don't want to have
# available when running the hub in production (e.g., having a compiler could
# result in an exploit...). This doesn't save space, but may improve security.
RUN \
  SUDO_FORCE_REMOVE=yes apt-get remove -y wget git make g++ sudo && \
  apt-get autoremove -y

# Launch the hub server listening on all interfaces
CMD \
  cd /smc/src && \
  . ./smc-env && \
  hub --database_nodes rethinkdb-proxy --host=$HOSTNAME --db_pool 50 --port 5000 --proxy_port 5001 --foreground

# Expose main http endpoint on port 5000 and the hub proxy on port 5001.
EXPOSE 5000 5001
