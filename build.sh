#!/bin/bash
set -eu

mkdir dist

for src_json in src/*.src.json; do
  src_json="${src_json%.src.json}"
  src_json="${src_json#src/}"
  echo "$src_json"
  node -e '
const fs = require("fs");

function removeCuratedExtra(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeCuratedExtra);
  } else if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "curated_extra") {
        result[key] = removeCuratedExtra(value);
      }
    }
    return result;
  }
  return obj;
}

const input = fs.readFileSync(0, "utf-8");
const data = JSON.parse(input);
const cleaned = removeCuratedExtra(data);
process.stdout.write(JSON.stringify(cleaned) + "\n");
' < "src/$src_json.src.json" > "dist/$src_json.json"
done

cp -r static/* dist
