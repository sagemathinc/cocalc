#!/usr/bin/env bash
cd `dirname "$0"`
. prometheus.env
exec python3 start-alertmanager.py

