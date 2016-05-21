# smc-webapp-static

## Purpose

smc-webapp-static uses nginx to serve static HTML/Javascript/etc. content to browser clients.

## Build docker image for local testing

This builds, but using cache of anything built so far, so good for development:

    docker build -t smc-webapp-static .

To build from scratch without any caching

    time docker build --no-cache -t smc-webapp-static .

## Build for pushing to kubernetes gcloud repo

