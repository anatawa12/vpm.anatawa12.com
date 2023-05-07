#!/bin/sh
set -eu

if test -f vpm.src.json; then
  jq -c . < vpm.src.json > vpm.json
fi

mkdir dist
cp * dist
