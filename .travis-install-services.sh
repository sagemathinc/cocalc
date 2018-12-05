# kucalc-style
set -ex

npm install coffeescript -g

cd $TRAVIS_BUILD_DIR/src
npm install uglify-js

# the first few are for the hub services, but we also build the project
for path in 'smc-util' 'smc-util-node' 'smc-hub' 'smc-webapp' 'smc-webapp/jupyter' 'smc-project' 'smc-project/jupyter' 'smc-webapp/jupyter'; do
    cd $TRAVIS_BUILD_DIR/src/$path
    npm install
done

# hub: build primus
env SALVUS_ROOT=$TRAVIS_BUILD_DIR/src PATH=$TRAVIS_BUILD_DIR/src/node_modules/.bin:$PATH $TRAVIS_BUILD_DIR/src/webapp-lib/primus/update_primus

# coffee: # the first few are for the hub services, but we also build the project
for path in 'smc-util' 'smc-util-node' 'smc-hub' 'smc-webapp' 'smc-project' 'smc-project/jupyter' 'smc-webapp/jupyter'; do
    coffee -c $TRAVIS_BUILD_DIR/src/$path
done

# project: typescript
cd $TRAVIS_BUILD_DIR/src/smc-project
$TRAVIS_BUILD_DIR/src/node_modules/.bin/tsc -p tsconfig.json

