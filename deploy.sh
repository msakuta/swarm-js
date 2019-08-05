#!/bin/bash -e

#if [ "$(git status --porcelain | wc -l | xargs)" -eq 0 ]; then
  #echo "Not exist deploying contents."
  #exit 0
#fi

remote=$CIRCLE_REPOSITORY_URL

echo "github.com ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAq2A7hRGmdnm9tUDbO9IDSwBK6TbQa+PXYPCPy6rbTrTtw7PHkccKrpp0yVhp5HdEIcKr6pLlVDBfOLX9QUsyCOV0wzfjIJNlGEYsdlLJizHhbn2mUjvSAHQqZETYP81eFzLQNnPHt4EVVUh7VfDESU84KezmD5QlWpXLmvU31/yMf+Se8xhHTvKSCZIFImWwoG6mbUoWf9nzpIoaSjB+weqqUUmpaaasXVal72J+UX2B+2RPW3RcT0eOzQgqlJL3RKrTJvdsjE3JEAvGq3lGHSZXy28G3skua2SmVi/w4yCE6gbODqnTWlg7+wC604ydGXA8VJiS5ap43JXiUFFAaQ==" >> ~/.ssh/known_hosts

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