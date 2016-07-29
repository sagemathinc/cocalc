FROM ubuntu:16.04
MAINTAINER William Stein <wstein@sagemath.com>
USER root

RUN \
  apt-get update && \
  apt-get install -y wget

# Avoid zombie python subprocesses from gsutil
RUN \
  wget -qO- https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 > /sbin/dumb-init  && \
  chmod +x /sbin/dumb-init

# Install node.js
RUN \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

# Install node modules defined in package.json (rethinkdb, coffe-script, async, etc.)
COPY package.json /package.json
RUN npm install
RUN ln -s /node_modules/.bin/coffee /usr/bin/coffee
ENV NODE_PATH=/node_modules

# Copy over main entry script
COPY run.coffee /run.coffee

ENTRYPOINT ["/sbin/dumb-init", "/usr/bin/coffee", "run.coffee"]