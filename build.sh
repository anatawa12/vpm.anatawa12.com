#!/bin/sh
set -eu

if test -f vpm.src.json; then
  jq -c . < vpm.src.json > vpm.json
fi

mkdir dist
cp README.md _redirects add-repo.html vpm.src.json vpm.json dist
