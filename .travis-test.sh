#!/usr/bin/env bash

# exit if there is a problem
set -ex

COPY_NODE_ENV="$NODE_ENV"

# special cases in kucalc mode

# we test if the webapp builds
if [[ $KUCALC_MODE == "webapp" ]]; then
    python install.py webapp build
    exit 0
fi

# running tests (install section did already build everything)
# easy warmup
cd $TRAVIS_BUILD_DIR/src/smc-util-node; npm run test

# jest only, until also the jupyter tests work
cd $TRAVIS_BUILD_DIR/src/smc-webapp/; npm test -- --ci

#- "cd $TRAVIS_BUILD_DIR/src/smc-webapp/; npm run testjcli" # broken

# no sage!
#cd $TRAVIS_BUILD_DIR/src/smc_sagews/smc_sagews/; python -m pytest tests/

#cd $TRAVIS_BUILD_DIR/src/smc-util/; npm test            # broken

# selection of working smc-util tests
# new sync code test
cd $TRAVIS_BUILD_DIR/src/smc-util/sync/
npx -q jest

# smc-util tests
cd $TRAVIS_BUILD_DIR/src/smc-util/
export NODE_ENV=mocha-test && SMC_TEST=true node_modules/.bin/mocha --reporter ${REPORTER:-progress} test/*.coffee
cd $TRAVIS_BUILD_DIR/src/smc-util/test/
npx -q jest

# reset node env
export NODE_ENV="$COPY_NODE_ENV"

# some hub tests
cd $TRAVIS_BUILD_DIR/src/smc-hub/
npm run testpg
npm run testmisc
npm run testkucalc
# npm run testapi # disabled, because it tries to run the sage server, etc

#cd $TRAVIS_BUILD_DIR/src/smc-project/; npm run test # also broken


#npm run coveralls # TODO ... that's from the past, not sure if that could still work. primarily for the webapp, though.


