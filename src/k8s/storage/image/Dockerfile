FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

RUN apt-get update && apt-get install -y ssh bup python3

# Install RethinkDB python3 client
RUN \
  apt-get install -y python3-pip && \
  pip3 install rethinkdb && \
  apt-get remove -y python3-pip dpkg-dev && \
  apt-get autoremove -y  && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /core

# Script to configure vm and run backup tool, sshfs server, etc.
ADD run.py /run.py

# Expose ssh ports
EXPOSE 22/tcp 22/udp

CMD /run.py


