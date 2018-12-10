#!/usr/bin/env bash
set -ex

# here we test if the hubs run
export COCALC_PROJECT_ID="cc642cf9-8c3b-4762-a45c-28e4509599de"
$TRAVIS_BUILD_DIR/src/dev/project/start_hub.py test
$TRAVIS_BUILD_DIR/src/dev/project/start_api.py test
$TRAVIS_BUILD_DIR/src/dev/project/start_share.py test
