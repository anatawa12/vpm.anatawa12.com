#!/bin/sh
set -eu

mkdir dist

pushd src
  jq -c . < vpm.src.json > dist/vpm.json
popd

cp src/* dist
