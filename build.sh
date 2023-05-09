#!/bin/bash
set -eu

mkdir dist

jq -c . < src/vpm.src.json > ../dist/vpm.json

cp src/* dist
