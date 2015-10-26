#!/usr/bin/env bash

# directory containing this script
export SAGEMATHCLOUD="`dirname \`readlink -f $BASH_SOURCE\``"

echo "Read SageMathCloud environment variables."
. "$SAGEMATHCLOUD"/sagemathcloud-env

echo "Remove port files."
rm  "$SAGEMATHCLOUD"/data/*.port

echo "Stop daemons."
local_hub      stop
console_server stop
sage_server    stop
