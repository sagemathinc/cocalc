#!/usr/bin/env bash
set -ev

cp "`pwd`/dist/bin/open.js" node_modules/.bin/open
chmod +x node_modules/.bin/open