# SMC Project Image

## Base Image -- ./image-base/

This image contains all the installed software packages, except SageMath, Anaconda, and other data. It mainly consists of deb packages from various sources and some compiled and globally installed software.

There are some versions of that image:

* `latest`: work in progress, about to be rebuilt, for testing, etc.
* `beta`: not used, but maybe useful at some point?
* `prod`: once latest works, it is tagged `prod`. The "main image" (described below) uses the `prod` version as it's "`FROM`" base.

Right now, it is controlled by a few commands which are collected in a Makefile.
The most important targets are:
* `build` → `install` → `update` cycle
* `run` and `root` for salvus (umask 022) for sagemath and anaconda or root shells (apt and pip installs)
* `commit` (after `root` or `run`)
* `beta` and `prod` to tag the `latest` image
* `test`
* `squash` → `clean` (squashing is good before creating a new prod image, because then updates are only)

In the future, this will be done via a small Python script.
In any case, the detailed workflow is sometimg like this:

### Workflow

1. `make build` to start from scratch:
  * pull latest version of the ubuntu image
  * execute the Dockerfile
  * note, this alone doesn't give you much -- this just leads to a rather empty but functional image
1. `make install` -- run this **once** to execute all ansible tasks.
1. `make update` -- run it as often as you want, it calls a subset of those ansible tasks which are meant to install new packages (where there are package lists) or update the existing ones.
1. Since it is not always working out that all commands for installing software run perfectly in one go, `make root` starts a root-shell in the latest image. That allows to do updates, re/install some software, etc. All installation steps are documented in the ansible files, which are setup in such a way to run locally. For example, the following command runs a few installations in the compute-extra.yaml playbook:

       /smc/src/smc-build/smc-ansible# ansible-playbook -i container.ini compute-extra.yaml --tags=kwant,giac,fenics,mpi,octave

  or this one runs everything related to the global R installation

       /smc/src/smc-build/smc-ansible# ansible-playbook -i container.ini r.yaml

  Notes:
  * the container.ini redirects the machines group "compute" to localhost.
  * the main ansible file collecting all playbooks is called `compute-setup.yaml` -- check its content to see which playbook files are relevant.
1. after `make root`, by default the changes are in an untagged container and hence lost at some point -- run `make commit` to save them as a new `latest` image.
  1. NOTE: when a setup step or installation didn't work out, it is maybe useful to *not* commit at all. Instead, exit the container and run `make root` again to try again from the same previous state.
1. when getting confident, that the `latest` image is looking good, either run `make beta` or `make prod` to update the versioned images.
1. To reclaim some disk space, run `make clean`
1. Run `make test` to execute integration tests. They help you to understand, if the installed software is really installed and working.

## Main Image -- ./image/

This image is based on `smc-project-base:prod` -- notice, it's `prod`!
The sole intention of this step is to add a small layer on top of the base image,
such that SMC projects can run inside it.

`make build` should be used to update it, which essentially runs the `Dockerfile` without caching.

1. get the files from the current master in SMC's repo and build the project.
2. install a special `run.py` file for starting the project's local hub server.
3. `make run` sets an env variable, which is the `PROJECT_ID`.


