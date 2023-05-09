#!/bin/bash

deno run \
  --allow-net \
  --allow-read=. \
  --allow-write=../src \
  --allow-env \
  build.ts \
  setting-experimental.json5

git add ../src/curated-experimental.src.json

if git diff-index --quiet --cached HEAD --; then
  echo "nothing updated!"
fi

git commit -m "update curated repository"
git push
