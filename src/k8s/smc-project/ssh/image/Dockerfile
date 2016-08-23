FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install ssh
RUN \
  apt-get update && \
  apt-get install -y ssh

# Install node.js version 6.
RUN \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

# Install node modules defined in package.json (rethinkdb, coffe-script, async, etc.)
COPY package.json /package.json
RUN npm install
RUN ln -s /node_modules/.bin/coffee /usr/bin/coffee

# Make it so the node modules we just installed are visible
ENV NODE_PATH=/node_modules

# Copy over other scripts
COPY run.coffee /run.coffee

ENTRYPOINT ["/usr/bin/coffee", "run.coffee"]

