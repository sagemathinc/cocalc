NAME ?= smc-project
ENV  ?=

include ../makefile

# that's a completely new random uuid
PROJECT_ID ?= 31631ff7-66ed-4d5f-93e7-aed0efd8a5d5

ENV += -e SMC_PROJECT_ID=${PROJECT_ID}

RUN = docker run -it ${VOL} ${ENV} "${TAG}"

PHONY += build run root bash

run:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	$(RUN)

root:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	$(RUN) bash

bash:
	@echo "running image with tag ${TAG} and project id ${PROJECT_ID}"
	$(RUN) /run.py bash
