FROM smc-project-base:prod
LABEL smc.component=project
MAINTAINER Harald Schilly <hsy@sagemath.com>

# Refresh SMC and build the project (mainly building dependencies ...)
WORKDIR /
RUN rm -f /manage.sh && \
    rm -rf /smc/ && \
    git clone --depth 1 https://github.com/sagemathinc/smc.git && \
    cd /smc/src/ && \
    . ./smc-env && \
    ./install.py pyutil && \
    ./install.py project && \
    rm -rf /smc/

# run.py will create the user corresponding to the project, mount their directory (?), then
# switch to that user and start the local hub.  The environment variable SMC_PROJECT_ID must be set.
COPY run.py /run.py
ENTRYPOINT ["/usr/bin/python", "/run.py"]

# Expose local hub port, etc....
EXPOSE 6000
