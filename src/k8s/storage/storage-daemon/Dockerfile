FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install Python3
RUN \
  apt-get update && apt-get install -y python3 python3-requests ssh

# Install RethinkDB python3 client
RUN \
  apt-get install -y python3-pip && \
  pip3 install rethinkdb && \
  apt-get remove -y python3-pip dpkg-dev && \
  apt-get autoremove -y  && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /core

COPY run.py /run.py
COPY install-tmp /install

CMD /run.py

