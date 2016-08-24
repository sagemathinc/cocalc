FROM smc-project-base:prod
LABEL smc.component=project
MAINTAINER Harald Schilly <hsy@sagemath.com>

# Refresh SMC and build the project (mainly building dependencies ...)
WORKDIR /
RUN rm -f /manage.sh && \
    rm -rf /smc/ && \
    git clone --depth 1 https://github.com/sagemathinc/smc.git && \
    apt-get install -y ssh && \
    cd /smc/src/ && \
    . ./smc-env && \
    ./install.py pyutil && \
    ./install.py project && \
    rm -rf /smc/ && \
    apt-get autoremove -y  && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /core && \
    mkdir -p /var/run/sshd

# run.py will create the user corresponding to the project, mount their directory (?), then
# switch to that user and start the local hub.  The environment variable SMC_PROJECT_ID must be set.
COPY run.py /run.py
COPY smc-project.conf /etc/supervisor/conf.d/smc-project.conf
# Custom wrapper to make a copy of the crontab to ~/.crontab_smc on successful write.
COPY crontab /usr/local/bin/crontab
# Run "/usr/bin/python -s" -- this is used by setup.py for smc_sagews, etc.
COPY python-nosite /usr/local/bin/python-nosite

ENTRYPOINT []
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]

# Expose local hub port, etc....
# Shouldn't we use port 5463 as an easter egg? :-)
EXPOSE 22 6000 6001
