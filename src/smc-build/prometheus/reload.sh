#!/usr/bin/env bash
# causes prometheus to reload the config and update itself
curl -X POST http://localhost:9090/-/reload

