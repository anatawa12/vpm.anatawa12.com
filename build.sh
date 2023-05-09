#!/bin/bash
set -eu

mkdir dist

for src_json in src/*.src.json; do
  src_json="${src_json%.src.json}"
  src_json="${src_json#src/}"
  echo "$src_json"
  jq -c . < "src/$src_json.src.json" > "dist/$src_json.json"
done

cp src/* dist
