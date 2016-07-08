# set tags by prefixing the make command
NAME    ?= smc-project-base
VERSION ?= latest
TAG      = ${NAME}:${VERSION}

# extra arguments for docker build
EXTRA_ARGS ?=

PHONY := build rebuild run edit commit clean tag prod

default: build

rebuild:
	@echo "re-building with tag ${TAG}"
	EXTRA_ARGS="--no-cache=true" $(MAKE) build

build:
	@echo "building with tag ${TAG}"
	docker build ${EXTRA_ARGS} --pull --rm "--tag=${TAG}" .

edit:
	@echo "starting bash in image with tag ${TAG} -- exit/ctrl-d to get out of it"
	docker run -it "${TAG}" bash
	@echo "you finished working with that image"
	@echo "you can run 'make commit' to update the image with your new edits"

commit:
	@echo "commit latest changes (after "edit"ing) to the image"
	$(eval ID = $(shell docker ps --all --latest --quiet --no-trunc --filter ancestor=${TAG}))
	docker commit ${ID} ${TAG}
	@echo "image ${TAG} has been updated and committed with the ID ${ID}"
	@echo "maybe run 'make clean' to get rid of untagged/unreferenced leftovers"

tag:
	@echo "tagging latest ${NAME} image with ${VERSION}"
	$(eval ID = $(shell docker images --quiet --no-trunc ${NAME}:latest))
	docker tag ${ID} ${NAME}:${VERSION}

prod: VERSION = prod
prod: tag

beta: VERSION = beta
beta: tag

clean:
	@echo 'remove all untagged docker images -- do not worry about errors'
	# this runs repeatedly until it fails, because once an image is deleted more become dangling!
	# it fails, because there is no "--no-run-if-empty" and hence docker complains
	while `docker images -q --filter "dangling=true" | xargs docker rmi`; do :; done
	@echo 'remove all docker container (not forced, hence running ones are not deleted)'
	docker ps -aq --no-trunc | xargs --no-run-if-empty docker rm


