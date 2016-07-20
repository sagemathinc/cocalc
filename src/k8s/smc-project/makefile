# common definitions
# set tags by prefixing the make command

VERSION ?= latest
TAG      = ${NAME}:${VERSION}
VOL      = --volume=/ext:/ext
RUN      = docker run -it "${VOL}" "${TAG}"

# extra arguments for docker build
EXTRA_ARGS ?=

PHONY = clean build rebuild tag prod beta snapshot

default: rebuild

rebuild:
	@echo "re-building with tag ${TAG}"
	EXTRA_ARGS="--no-cache=true" $(MAKE) build

build:
	@echo "building with tag ${TAG}"
	docker build ${EXTRA_ARGS} --rm "--tag=${TAG}" .

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
	-docker ps -aq --no-trunc | xargs --no-run-if-empty docker rm
	@echo 'remove all untagged docker images -- do not worry about errors'
	# this runs repeatedly until it fails, because once an image is deleted more become dangling!
	# it fails, because there is no "--no-run-if-empty" and hence docker complains
	-while `docker images -q --filter "dangling=true" | xargs docker rmi`; do :; done

snapshot:
	$(eval DATE = $(shell date -u +"%Y-%m-%d-%H%M%S"))
	gcloud compute disks snapshot extern-compute --snapshot-names extern-compute-${DATE}
	@echo snapshot created: extern-compute-${DATE}
