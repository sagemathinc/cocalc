# kucalc-style
set -e

npm install coffeescript -g

cd $TRAVIS_BUILD_DIR/src
npm install uglify-js

for path in 'smc-util' 'smc-util-node' 'smc-hub' 'smc-webapp' 'smc-webapp/jupyter'; do
    cd $TRAVIS_BUILD_DIR/src/$path
    npm install
done

# primus
env SALVUS_ROOT=$TRAVIS_BUILD_DIR/src PATH=$TRAVIS_BUILD_DIR/src/node_modules/.bin:$PATH $TRAVIS_BUILD_DIR/src/webapp-lib/primus/update_primus

# coffee
for path in 'smc-util' 'smc-util-node' 'smc-hub' 'smc-webapp'; do
    coffee -c $TRAVIS_BUILD_DIR/src/$path
done
