NAME ?= smc-project

include ../makefile

# that's a completely new random uuid
PROJECT_ID ?= 31631ff7-66ed-4d5f-93e7-aed0efd8a5d5

PHONY += build rebuild run clean tag prod

run:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} "${TAG}"
