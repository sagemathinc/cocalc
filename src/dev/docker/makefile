build:
	docker build -t smc .

build-full:
	docker build --no-cache -t smc .

run:
	mkdir -p ../../data/projects && docker run -v `pwd`/../../data/projects:/projects -P smc

