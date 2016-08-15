FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# NOTE: bsdtar is needed for sparse files!
RUN apt-get update && apt-get install -y bup python3 bsdtar

# Install RethinkDB python3 client
RUN \
  apt-get install -y python3-pip && \
  pip3 install rethinkdb && \
  apt-get remove -y python3-pip dpkg-dev && \
  apt-get autoremove -y  && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /core

# Also install gcloud SDK, so we can use Google Cloud Storage to upload backups
RUN \
  apt-get update && \
  apt-get install -y lsb-release wget

# Install dumb-init, which is CRITICAL since otherwise we'll get millions of zombie subprocesses from gcloud.
RUN \
  wget -qO- https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 > /sbin/dumb-init  && \
  chmod +x /sbin/dumb-init

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

# Install RethinkDB python3 client -- used for coordinating backups
RUN \
  apt-get install -y python3-pip && \
  pip3 install rethinkdb && \
  apt-get remove -y python3-pip dpkg-dev && \
  apt-get autoremove -y  && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /core

ADD run.py /run.py
CMD /run.py


