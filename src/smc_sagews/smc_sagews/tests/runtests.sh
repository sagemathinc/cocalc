#!/bin/bash

export SAGE_ROOT=${SAGE_ROOT:-${EXT:-/ext}/sage/sage}
. $SAGE_ROOT/src/bin/sage-env
python -m pytest $@
