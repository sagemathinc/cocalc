FROM smc-hub-base

USER root

# Pull latest source code for SMC
RUN cd /smc && git pull

# Rebuild hub -- this uses npm to update any dependencies, or install anything newly required.
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
  hub --database_nodes rethinkdb-proxy --host=$HOSTNAME --port 5000 --proxy_port 5001 --foreground

# Expose main http endpoint on port 5000 and the hub proxy on port 5001.
EXPOSE 5000 5001
