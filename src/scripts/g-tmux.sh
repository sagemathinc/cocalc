#!/usr/bin/env bash

tmux new-session -d -s mysession
tmux new-window -t mysession:1
sleep 1
tmux send-keys -t mysession:1 './scripts/g.sh' C-m
sleep 1
tmux send-keys -t mysession:0 'pnpm database' C-m
tmux attach -t mysession
