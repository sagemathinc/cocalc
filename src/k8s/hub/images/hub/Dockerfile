FROM ubuntu:16.04

MAINTAINER William Stein <wstein@sagemath.com>

USER root

# So we can source (see http://goo.gl/oBPi5G)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Install the deps for building and running the hub.
RUN \
  apt-get update && \
  apt-get install -y wget git python make g++ sudo && \
  wget -qO- https://deb.nodesource.com/setup_5.x | bash - && \
  apt-get install -y nodejs

# Grab an initial version of the source code for SMC (do NOT use --depth=1, since we want to be able to checkout any commit later)
RUN git clone https://github.com/sagemathinc/smc.git

# Do initial build of hub (this means installing all dependencies using npm)
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub && \
  rm -rf /root/.npm /root/.node-gyp/

# Create symlinks to the secrets files that kubernetes will create
RUN \
   mkdir -p /smc/src/data/secrets && \
   cd /smc/src/data/secrets && \
   ln -s /secrets/rethinkdb/rethinkdb . && \
   ln -s /secrets/zendesk/zendesk . && \
   ln -s /secrets/sendgrid/sendgrid .

# FOR DEV PURPOSES ONLY -- remove later
RUN apt-get install -y ssh vim

# Which commit to checkout and build.
ARG commit=HEAD
# Pull latest source code for SMC
RUN cd /smc && git pull && git fetch origin && git checkout ${commit:-HEAD}

# Build hub -- this uses npm to update any dependencies, or install anything required.
RUN \
  cd /smc/src && \
  . ./smc-env && \
  ./install.py hub && \
  rm -rf /root/.npm /root/.node-gyp/

# Remove packages needed for the build above, which we don't want to have
# available when running the hub in production (e.g., having a compiler could
# result in an exploit...). This doesn't save space, but may improve security.
#RUN \
#  SUDO_FORCE_REMOVE=yes apt-get remove -y wget git make g++ sudo && \
#  apt-get autoremove -y

# Launch the hub server listening on all interfaces
#CMD \
#  cd /smc/src && \
#  . ./smc-env && \
#  hub --host=$HOSTNAME --db_pool=$SMC_DB_POOL --db_concurrent_warn=$SMC_DB_CONCURRENT_WARN --port 5000 --proxy_port 0 --foreground --kubernetes
#  cd /smc/src &&  . ./smc-env && hub --host=$HOSTNAME --db_pool=1 --db_concurrent_warn=10 --port 5000 --proxy_port 0 --foreground --kubernetes

# FOR DEV PURPOSES ONLY
COPY .ssh /root/.ssh
COPY go /smc/src/go
COPY run.py /run.py
CMD ./run.py

EXPOSE 5000
