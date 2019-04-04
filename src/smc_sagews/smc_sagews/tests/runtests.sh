#!/bin/bash

export SAGE_ROOT=/ext/sage/sage
. /ext/sage/sage/src/bin/sage-env
python -m pytest $@