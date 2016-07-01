FROM smc-webapp-static-base

MAINTAINER William Stein <wstein@sagemath.com>

# Which commit to checkout and build.
ARG commit=HEAD

# Configuration of NGINX
COPY default.conf /etc/nginx/conf.d/default.conf

# Optional GA token (needs to be an empty file if not set)
COPY google_analytics /smc/src/data/config/

# Pull latest version of code and rebuild
RUN cd /smc/src && . ./smc-env && git pull && git fetch origin && git checkout ${commit:-HEAD} && ./install.py webapp build

# Delete everything except the static site that we want to serve (no point in wasting space)
RUN rsync -axHL /smc/src/static/ /static/  && rm -rf /smc

# Remove build pre-requisites that are no longer needed for just running the nginx static server
RUN \
  apt-get -y remove wget git python python-yaml nodejs && \
  apt-get -y autoremove

# Start nginx server running
CMD ["nginx", "-g", "daemon off;"]
