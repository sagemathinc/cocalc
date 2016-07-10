FROM ubuntu:16.04
MAINTAINER Harald Schilly <hsy@sagemath.com>
LABEL smc.component=project-base
USER root

# So we can source (see http://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work)
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

# Install Node.js, Ansible and some basic packages
RUN apt-get update && \
    apt-get install --yes \
      aptitude \
      apt-utils \
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
    apt-get install --yes ansible

# Grab source code for SMC
RUN git clone --depth 1 https://github.com/sagemathinc/smc.git
COPY update.sh /update.sh

# this runs the meta-playbook "compute-setup" with the modified machines file on localhost
WORKDIR /smc/src/smc-build/smc-ansible
RUN ansible-playbook -i container.ini compute-setup.yaml

