FROM ubuntu:16.04
MAINTAINER William Stein <wstein@sagemath.com>
USER root

RUN \
  apt-get update && \
  apt-get install -y wget bup

# Avoid zombie python subprocesses from gsutil
RUN \
  wget -qO- https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 > /sbin/dumb-init  && \
  chmod +x /sbin/dumb-init

# Install node.js
RUN \
  wget -qO- https://deb.nodesource.com/setup_6.x | bash - && \
  apt-get install -y nodejs

# Install Google Cloud SDK -- needed for uploading/downloading tar archives of bup repos to gcloud
RUN \
  export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)" && \
  echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | tee /etc/apt/sources.list.d/google-cloud-sdk.list && \
  wget -qO- https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
  apt-get update && apt-get -y install google-cloud-sdk

# Install crcmod so that gsutil rsync isn't super slow
RUN \
  apt-get -y install gcc python-dev python-setuptools && \
  easy_install -U pip && \
  pip install -U crcmod

# Install node modules defined in package.json (rethinkdb, coffe-script, async, etc.)
COPY package.json /package.json
RUN npm install
RUN ln -s /node_modules/.bin/coffee /usr/bin/coffee
ENV NODE_PATH=/node_modules

# Copy over main entry script
COPY run.coffee /run.coffee

# Utility functions used by main script (placed by control.py)
COPY util.coffee /util.coffee

ENTRYPOINT ["/sbin/dumb-init", "/usr/bin/coffee", "run.coffee"]