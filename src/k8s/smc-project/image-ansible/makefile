TAG ?= smc-project-ansible
PROJECT_ID ?= 31631ff7-66ed-4d5f-93e7-aed0efd8a5d5

PHONY := build run bash

default: build

build:
	@echo building with tag ${TAG}
	docker build --force-rm -t ${TAG} .

run:
	@echo running image with tag ${TAG} and project id ${PROJECT_ID}
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} ${TAG} 

bash:
	@echo starting bash in image with tag ${TAG} and project id ${PROJECT_ID}
	docker run -it -e SMC_PROJECT_ID=${PROJECT_ID} ${TAG} bash

	
