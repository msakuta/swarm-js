#!/bin/bash -e

#if [ "$(git status --porcelain | wc -l | xargs)" -eq 0 ]; then
  #echo "Not exist deploying contents."
  #exit 0
#fi

remote=$CIRCLE_REPOSITORY_URL

cd /tmp/artifacts
git init
git remote add origin $remote || true

git config --global user.name "Circle CI"
git config --global user.email "<>"
git checkout -b gh-pages
git add -A
git commit -m "[ci skip] Deploy by CI"

git push -f origin gh-pages:gh-pages

echo "Deploying a site at $remote"

cd -