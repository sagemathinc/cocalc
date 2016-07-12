# set tags by prefixing the make command
NAME    ?= smc-project-base
VERSION ?= latest
TAG      = ${NAME}:${VERSION}

# extra arguments for docker build
EXTRA_ARGS ?=

PHONY := build rebuild run edit commit clean tag prod squash test

default: build

rebuild:
	@echo "re-building with tag ${TAG}"
	EXTRA_ARGS="--no-cache=true" $(MAKE) build

build:
	@echo "building with tag ${TAG}"
	docker build ${EXTRA_ARGS} --pull --rm "--tag=${TAG}" .

squash:
	@echo "remove all intermediate layers after several edit steps"
	$(eval ID = $(shell docker create ${NAME}:latest bash))
	@echo container ID = ${ID}
	docker export ${ID} | docker import - ${NAME}:latest
	@echo "squashing completed. consider running 'make clean' to free some space ..."

install:
	@echo "runs all ansible install tasks -- do this once after rebuilding the image"
	docker run -it "${TAG}" install
	$(MAKE) commit

update:
	@echo "runs all ansible tasks marked as 'update'"
	docker run -it "${TAG}" update
	$(MAKE) commit
	@echo "consider to run 'make squash' after several such update steps!"

test:
	@echo "runs all integration tests"
	docker run -it "${TAG}" test

edit run:
	@echo "starting bash in image with tag ${TAG} -- exit/ctrl-d to get out of it"
	docker run -it "${TAG}" bash
	@echo "!!! >>>> Run 'make commit' to update the image with your new edits -- otherwise they're discarded <<<< !!!"
	@echo "also consider to run 'make squash' after several edit steps!"

commit:
	@echo "commit latest changes (after "edit"ing) of the container to the image"
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
	@echo 'remove all docker container (not forced, hence running ones are not deleted)'
	docker ps -aq --no-trunc | xargs --no-run-if-empty docker rm
	@echo 'remove all untagged docker images -- do not worry about errors'
	# this runs repeatedly until it fails, because once an image is deleted more become dangling!
	# it fails, because there is no "--no-run-if-empty" and hence docker complains
	while `docker images -q --filter "dangling=true" | xargs docker rmi`; do :; done


