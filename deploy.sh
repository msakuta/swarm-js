#!/bin/bash -e

#if [ "$(git status --porcelain | wc -l | xargs)" -eq 0 ]; then
  #echo "Not exist deploying contents."
  #exit 0
#fi

remote = $(git config --get remote.origin.url)

cd /tmp/artifacts
git init
git remote add origin $remote

git config --global user.name "Circle CI"
git config --global user.email "<>"
git add -A
git commit -m "[ci skip] Deploy by CI"

git push -f $remote gh-pages > /dev/null/ 2>&1

echo "Deploying a site at $remote"

cd -