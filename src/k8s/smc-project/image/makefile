# set tags by prefixing the make command
NAME    ?= smc-project
VERSION ?= latest
TAG      = ${NAME}:${VERSION}

# that's a completely new random uuid
PROJECT_ID ?= 31631ff7-66ed-4d5f-93e7-aed0efd8a5d5

# extra arguments for docker build
EXTRA_ARGS ?=

PHONY := build rebuild run clean tag prod

default: build

rebuild:
	@echo "re-building with tag ${TAG}"
	EXTRA_ARGS="--no-cache=true" $(MAKE) build

build:
	@echo "building with tag ${TAG}"
	docker build ${EXTRA_ARGS} --rm "--tag=${TAG}" .

run:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} "${TAG}"

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


