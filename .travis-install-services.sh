# kucalc-style
set -ex

npm install -g coffeescript uglify-js

cd $TRAVIS_BUILD_DIR/src

# the first few are for the hub services, but we also build the project
export SMC_ROOT=$TRAVIS_BUILD_DIR/src/
export SALVUS_ROOT=$SMC_ROOT

. $TRAVIS_BUILD_DIR/src/scripts/cocalc-dirs.sh

for path in "${CODE_DIRS[@]}"; do
    cd $path
    npm ci
done

cd $TRAVIS_BUILD_DIR/src

# hub: build primus
env PATH=$TRAVIS_BUILD_DIR/src/node_modules/.bin:$PATH $TRAVIS_BUILD_DIR/src/webapp-lib/primus/update_primus

# coffee: # the first few are for the hub services, but we also build the project
for path in smc-util smc-util-node smc-hub smc-webapp smc-project smc-project/jupyter smc-webapp/jupyter; do
    coffee -c $TRAVIS_BUILD_DIR/src/$path
done

## project: typescript
#cd $TRAVIS_BUILD_DIR/src/smc-project
#$TRAVIS_BUILD_DIR/src/node_modules/.bin/tsc -p tsconfig.json

