FROM ubuntu:16.04

USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install Python3
RUN \
  apt-get update && \
  apt-get install -y wget

# Install dumb-init, which is CRITICAL since otherwise we'll get millions of zombie python subprocesses from gcloud.
RUN \
  wget -qO- https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 > /sbin/dumb-init  && \
  chmod +x /sbin/dumb-init

# Install node.js
RUN \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

COPY run.coffee /run.coffee
COPY package.json /package.json
COPY kubectl /usr/bin/kubectl

# Install node modules defined in package.json (rethinkdb and coffe-script)
RUN \
  npm install

ENTRYPOINT ["/sbin/dumb-init", "/node_modules/.bin/coffee", "run.coffee"]

