#!/bin/bash

export SAGE_ROOT=/ext/sage/sage
. $SAGE_ROOT/src/bin/sage-env
python -m pytest $@