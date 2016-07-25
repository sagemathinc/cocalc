NAME ?= smc-project-base

# for build: tells docker to also update the linux base image
EXTRA_ARGS=--pull

include ../makefile

PHONY += run root commit clean squash test

squash:
	@echo "remove all intermediate layers after several edit steps"
	$(eval ID = $(shell docker create ${NAME}:latest))
	@echo container ID = ${ID}
	# no idea, if --change ENTRYPOINT is really necessary
	docker export ${ID} | docker import --change 'ENTRYPOINT ["./manage.sh"]' - ${NAME}:latest
	@echo "squashing completed. consider running 'make clean' to free some space ..."

install:
	@echo "runs all ansible install tasks -- do this once after rebuilding the image"
	$(eval ID = $(shell $(CREATE) install))
	docker start -ai ${ID}
	@echo "to commit, run ${COMMIT}"

update:
	@echo "runs all ansible tasks marked as 'update'"
	$(eval ID = $(shell $(CREATE) update))
	docker start -ai ${ID}
	@echo "to commit, run ${COMMIT}"
	@echo "consider to run 'make squash' after several such update steps!"

test:
	@echo "runs all integration tests"
	$(RUN) test

run:
	@echo "starting bash in image with tag ${TAG} -- exit/ctrl-d to get out of it"
	$(eval ID = $(shell $(CREATE) run))
	docker start -ai ${ID}
	@echo "to commit, run ${COMMIT}"
	@echo "also consider to run 'make squash' after several edit steps!"

root:
	@echo "starting root bash shell in image with tag ${TAG} -- exit/ctrl-d to get out of it"
	$(eval ID = $(shell $(CREATE) root))
	docker start -ai ${ID}
	@echo "to commit, run ${COMMIT}"
	@echo "also consider to run 'make squash' after several edit steps!"


