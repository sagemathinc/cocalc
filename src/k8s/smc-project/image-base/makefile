NAME ?= smc-project-base

include ../makefile

PHONY += run edit commit clean squash test

squash:
	@echo "remove all intermediate layers after several edit steps"
	$(eval ID = $(shell docker create ${NAME}:latest))
	@echo container ID = ${ID}
	docker export ${ID} | docker import - ${NAME}:latest
	@echo "squashing completed. consider running 'make clean' to free some space ..."

install:
	@echo "runs all ansible install tasks -- do this once after rebuilding the image"
	$(RUN) install
	$(MAKE) commit

update:
	@echo "runs all ansible tasks marked as 'update'"
	$(RUN) update
	$(MAKE) commit
	@echo "consider to run 'make squash' after several such update steps!"

test:
	@echo "runs all integration tests"
	$(RUN) test

edit run:
	@echo "starting bash in image with tag ${TAG} -- exit/ctrl-d to get out of it"
	$(RUN) bash
	@echo "!!! >>>> Run 'make commit' to update the image with your new edits -- otherwise they're discarded <<<< !!!"
	@echo "also consider to run 'make squash' after several edit steps!"

commit:
	@echo "commit latest changes (after "edit"ing) of the container to the image"
	$(eval ID = $(shell docker ps --all --latest --quiet --no-trunc --filter ancestor=${TAG}))
	docker commit ${ID} ${TAG}
	@echo "image ${TAG} has been updated and committed with the ID ${ID}"
	@echo "maybe run 'make clean' to get rid of untagged/unreferenced leftovers"

