FROM ubuntu:16.04
MAINTAINER Harald Schilly <hsy@sagemath.com>
LABEL smc.component=project-base
ENV LC_ALL C.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV TERM screen
USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Install Node.js, Ansible and some basic packages
RUN apt-get update && \
    apt-get install --yes \
      aptitude \
      apt-utils \
      wget \
      build-essential \
      m4 \
      curl \
      git \
      vim \
      python \
      python-pip \
      python-psutil \
      dpkg-dev \
      sudo \
      software-properties-common && \
    curl -sL https://deb.nodesource.com/setup_5.x | bash - && \
    apt-get install --yes nodejs && \
    apt-add-repository ppa:ansible/ansible && \
    apt-get update && \
    apt-get install --yes ansible && \
    locale-gen en_US.UTF-8 de_DE.UTF-8 fr_FR.UTF-8 ru_RU.UTF-8 es_ES.UTF-8

COPY manage.sh /manage.sh

ENTRYPOINT ["/manage.sh"]
