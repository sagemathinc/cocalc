FROM ubuntu:16.04

USER root

MAINTAINER William Stein <wstein@sagemath.com>

# Install Python3
RUN \
  apt-get update && apt-get install -y python3 python3-requests

COPY run.py /run.py
COPY install-tmp /install

CMD /run.py

