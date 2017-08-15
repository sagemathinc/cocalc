build:
	docker build -t cocalc .

build-full:
	docker build --no-cache -t cocalc .

run:
	mkdir -p ../../data/projects && docker run -v `pwd`/../../data/projects:/projects -P cocalc

