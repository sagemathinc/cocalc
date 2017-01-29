#!/usr/bin/env bash
set -e
set -v
exit 1

time ./migrate.py -e -p accounts projects account_creation_actions compute_servers passport_settings password_reset_attempts public_paths remember_me server_settings storage_servers system_notifications

time ./update.sh 24

time ./migrate.py -u -p all
