# set tags by prefixing the make command
TAG ?= smc-project-ansible

# that's a completely new random uuid
PROJECT_ID ?= 31631ff7-66ed-4d5f-93e7-aed0efd8a5d5

# extra arguments for docker build
EXTRA_ARGS ?=

PHONY := build rebuild run edit commit clean

default: build

rebuild:
	@echo "re-building with tag ${TAG}"
	EXTRA_ARGS="--no-cache=true" $(MAKE) build

build:
	@echo "building with tag ${TAG}"
	docker build ${EXTRA_ARGS} --pull --rm "--tag=${TAG}" .

run:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} "${TAG}"

edit:
	@echo "starting bash in image with tag ${TAG} and project id ${PROJECT_ID} -- exit or ctrl-d to get out of it"
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} "${TAG}" bash
	@echo "you finished working with that image"
	@echo "you can run 'make commit' to update the image with your new edits"

commit:
	@echo "commit latest changes (after running bash!) to the image"
	$(eval ID = $(shell docker ps --all --latest --quiet --no-trunc --filter ancestor=${TAG}))
	docker commit ${ID} ${TAG}:latest
	@echo "image ${TAG} has been updated and committed with the ID ${ID}"
	@echo "maybe run 'make clean' to get rid of untagged/unreferenced leftovers"

clean:
	@echo 'remove all untagged docker images'
	# this runs repeatedly until it fails, because once an image is deleted more become dangling!
	# it fails, because there is no "--no-run-if-empty" and hence docker complains
	while `docker images -q --filter "dangling=true" | xargs docker rmi`; do :; done
	@echo 'remove all docker container (not forced, hence running ones are not deleted)'
	docker ps -aq --no-trunc | xargs --no-run-if-empty docker rm


