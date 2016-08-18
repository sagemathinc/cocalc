FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install Node.js
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

# Install node modules defined in package.json (rethinkdb, coffe-script, async, etc.)
COPY package.json /package.json
RUN npm install
RUN ln -s /node_modules/.bin/coffee /usr/bin/coffee
ENV NODE_PATH=/node_modules  

# Install Google Cloud SDK
RUN \
  export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)" && \
  echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | tee /etc/apt/sources.list.d/google-cloud-sdk.list && \
  wget -qO- https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
  apt-get update && apt-get -y install google-cloud-sdk

COPY run.coffee /run.coffee
COPY kubectl /usr/bin/kubectl

ENTRYPOINT ["/sbin/dumb-init", "/usr/bin/coffee", "run.coffee"]

