PYTHON ?= python3

INDIR  := input
OUTDIR := ../webapp-lib/wizard

INPUT  := $(shell find . ${INDIR}/ -type f -name '*.yaml')
OUTPUT := ${OUTDIR}/wizard.json

.PHONY: clean

${OUTPUT}: ${INPUT}
	${PYTHON} wizard.py ${INDIR} ${OUTPUT}

clean:
	-${RM} ${OUTPUT}
