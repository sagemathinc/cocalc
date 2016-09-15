#!/usr/bin/env bash
cd `dirname "$0"`
. prometheus.env
exec python start-alertmanager.py

