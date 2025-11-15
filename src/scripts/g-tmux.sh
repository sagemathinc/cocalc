#!/usr/bin/env bash

echo "Spawning tmux windows with: hub, database, rspack or memory monitor..."
export DEBUG_CONSOLE='no'

export PWD=`pwd`
tmux new-session -d -s mysession
tmux new-window -t mysession:1
tmux new-window -t mysession:2
sleep 2
tmux send-keys -t mysession:0 '$PWD/scripts/g.sh' C-m
sleep 2
tmux send-keys -t mysession:1 'pnpm database' C-m

if [ -n "$NO_RSPACK_DEV_SERVER" ]; then
    sleep 2
    tmux send-keys -t mysession:2 'pnpm rspack' C-m
fi

tmux attach -t mysession:1
