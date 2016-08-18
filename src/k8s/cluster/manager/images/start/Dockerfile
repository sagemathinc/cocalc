FROM ubuntu:16.04

USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

MAINTAINER William Stein <wstein@sagemath.com>

# Install Python3
RUN \
  apt-get update && \
  apt-get install -y lsb-release wget python3

# Install dumb-init, which is CRITICAL since otherwise we'll get millions of zombie python subprocesses from gcloud.
RUN \
  wget -qO- https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 > /sbin/dumb-init  && \
  chmod +x /sbin/dumb-init

# Install Google Cloud SDK
RUN \
  export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)" && \
  echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | tee /etc/apt/sources.list.d/google-cloud-sdk.list && \
  wget -qO- https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
  apt-get update && apt-get -y install google-cloud-sdk

COPY run.py /run.py
COPY kubectl /usr/bin/kubectl

ENTRYPOINT ["/sbin/dumb-init", "/run.py"]

