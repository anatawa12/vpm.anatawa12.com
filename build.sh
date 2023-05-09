#!/bin/sh
set -eu

pushd src
if test -f vpm.src.json; then
  jq -c . < vpm.src.json > vpm.json
fi
popd

mkdir dist
cp src/* dist
