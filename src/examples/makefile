PYTHON ?= python3

INDIR  := input
OUTDIR := ../webapp-lib/examples

INPUT  := $(shell find . ${INDIR}/ -type f -name '*.yaml')
OUTPUT := ${OUTDIR}/examples.json

.PHONY: clean

${OUTPUT}: ${INPUT}
	${PYTHON} build.py ${INDIR} ${OUTPUT}

clean:
	-${RM} ${OUTPUT}
