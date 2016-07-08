# SMC Project Image

## Base Image -- ./image-base/

This image contains all the installed software packages, except SageMath, Anaconda, and other data. It mainly consists of deb packages from various sources and some compiled and globally installed software.

There are some versions of that image:

* `latest`: work in progress, about to be rebuilt, for testing, etc.
* `beta`: not used, but maybe useful at some point?
* `prod`: once latest works, it is tagged `prod`. The "main image" (described below) uses the `prod` version as it's "`FROM`" base.

Right now, it is controlled by a few commands which are collected in a Makefile. In the future, this will be done via a small Python script. In any case, the workflow is like this:

1. `make rebuild` to start from scratch:
  * pull latest version of the ubuntu image
  * execute the Dockerfile
2. `make build` -- just like rebuild but uses the cache if the rebuild failed.
3. Since it is not always working out that all commands for installing software run perfectly in one go, `make edit` starts a bash in the latest image. That allows to do updates, re/install some software, etc. All installation steps are documented in the ansible files, which are setup in such a way to run locally. For example, the following command runs a few installations in the compute-extra.yaml playbook:

       /smc/src/smc-build/smc-ansible# ansible-playbook -i container.ini compute-extra.yaml --tags=kwant,giac,fenics,mpi,octave

  or this one runs everything related to the global R installation

       /smc/src/smc-build/smc-ansible# ansible-playbook -i container.ini r.yaml

  Notes:
  * the container.ini redirects the machines group "compute" to localhost.
  * the main ansible file collecting all playbooks is called `compute-setup.yaml` -- check its content to see which playbook files are relevant.
4. after `make edit`, by default the changes are in an untagged image and hence lost at some point. run `make commit` to save them as a new latest image.
  1. NOTE: when a setup step or installation didn't work out, it is maybe useful to *not* commit at all. Instead, run `make edit` again to try again from the same previous state.
5. when getting confident, that the `latest` image is looking good, either run `make beta` or `make prod` to update the versioned images.
6. To reclaim some disk space, run `make clean`

TODO: integration tests, to see if the installed software is really working.

## Main Image -- ./image/

This image is based on `smc-project-base:prod` -- notice, it's `prod`!

`make rebuild` should be used to update it, which essentially runs the `Dockerfile` without caching.

1. get the files from the current master in SMC's repo and build the project.
2. install a special `run.py` file for starting the project's local hub server.
3. `make run` sets an env variable, which is the `PROJECT_ID`.


