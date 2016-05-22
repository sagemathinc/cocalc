# SMC Project

**Warning:** Just playing around for now; nothing serious.

Build it:

    docker build -t smc-project .

Try it:

    docker run -it -e SMC_PROJECT_ID=3702601d-9fbc-4e4e-b7ab-c10a79e34d3b smc-project

The next things to do:

- [ ] make the local_hub port not be random.

- [ ] install more software in image (?), via a massive apt-get

## k8s todo stuff

- [ ] mount a read-only PD with all of the /projects/sage info

- [ ] figure out how to mount /projects/project_id for real **efficiently**; this seems potentially impossible or very, very difficult at least.  We shall see