FROM smc-project-base:prod
LABEL smc.component=project
MAINTAINER Harald Schilly <hsy@sagemath.com>

# Refresh SMC
WORKDIR /
RUN rm -rf /smc
RUN git clone --depth 1 https://github.com/sagemathinc/smc.git

# Build (mainly involves installing dependencies)
WORKDIR /smc/src/
RUN \
  . ./smc-env && \
  ./install.py pyutil && \
  ./install.py project

COPY run.py /run.py

# run.py will create the user corresponding to the project, mount their directory (?), then
# switch to that user and start the local hub.  The environment variable SMC_PROJECT_ID must be set.

CMD ["/usr/bin/python", "/run.py"]

# Expose local hub port, etc....
EXPOSE 6000
