#!/usr/bin/env bash

tmux new-session -d -s mysession
tmux new-window -t mysession:1
tmux new-window -t mysession:2
sleep 2
tmux send-keys -t mysession:1 './scripts/g.sh' C-m
sleep 2
tmux send-keys -t mysession:0 'pnpm database' C-m

if [ -n "$NO_RSPACK_DEV_SERVER" ]; then
sleep 2
tmux send-keys -t mysession:2 'pnpm rspack' C-m
fi

tmux attach -t mysession
