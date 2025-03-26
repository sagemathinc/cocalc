#!/bin/bash
set -v

while true; do
  # Fetch the latest commits from upstream
  git fetch

  # Check if local branch is behind the upstream branch
  LOCAL=$(git rev-parse HEAD)
  UPSTREAM=$(git rev-parse @{u})

  if [ "$LOCAL" != "$UPSTREAM" ]; then
    echo "Changes detected in upstream. Pulling changes and executing commands."

    git pull

    ./scripts/run-ci.sh
    # temporary workaround
    pkill -f `pwd`/packages/project/node_modules/@cocalc/project/bin/cocalc-project.js
    if [ $? -eq 0 ]; then
        echo "success at `date`" >> ci.log
    else
        echo "FAIL at `date`" >> ci.log
    fi
  else
    echo "No changes detected. Checking again in 30 seconds."
  fi

  # Wait for 30 seconds before checking again
  sleep 30
done