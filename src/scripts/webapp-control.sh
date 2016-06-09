#!/usr/bin/env bash
# This script initializes a local bare repository, used to push out
# updates to the compiled and static webapp files.
#
# Run it once to update the webapp.git in a global repository,
# then issue checkout or reset commands to the local repositories in the web frontends.

set -e
#set -v

WEBAPP="static"
ORIGIN="${ORIGIN:-admin0}"
GITURL="${GITURL:-salvus@admin0:/home/salvus/webapp.git}"
BRANCH="master"

echo "GITURL: $GITURL"

# test if $SMC_ROOT is set
if [[ ! -d "$SMC_ROOT" ]]; then
   echo "ERROR: The env variable SMC_ROOT must be set to the root of SMC in smc/src"
   exit 1
fi

# we assume that the entire $WEBAPP dir is wiped after each build
# hence a separate .git directory
function mk_webapp_git () {
    # echo "create $WEBAPP.git if necessary"
    cd "$SMC_ROOT"
    if [ ! -d "$WEBAPP.git" ]; then
        mkdir "$WEBAPP.git"
        cd "$WEBAPP.git"
        git init --bare
        git remote add $ORIGIN $GITURL
        cd ..
    fi
}

function init () {
    # defining $GIT this way keeps the webapp dir clean of git itself
    cd "$SMC_ROOT"
    mk_webapp_git
    cd "$WEBAPP"
    # vars are global by default
    GIT="git --git-dir=../$WEBAPP.git --work-tree=."
    $GIT fetch $ORIGIN
    # If -B is given, <new_branch> is created if it doesn't exist; otherwise, it is reset.
    $GIT checkout -B $BRANCH
}

function webapp_push () {
    init
    # non-destructive move of HEAD to where it is remotely
    # this fails when the remote repository is fresh and completely empty
    # there is simply no $ORIGIN/$BRANCH defined - just comment the line, and run again ...
    $GIT reset --soft $ORIGIN/$BRANCH
    # adding all files, including new ones
    $GIT add -A -- .
    $GIT commit -m "webapp based on SMC @ $SMC_REV"
    $GIT push $ORIGIN master -f

    echo "DONE: pushed compiled webapp files to git"
    $GIT log --pretty=format:"%h %ad %s" -1
    echo "NEXT STEP: run '$0 pull' on web nodes"
}

function webapp_pull () {
    init
    REV=${1:-$BRANCH}
    echo "Updating static webapp files to $ORIGIN/$REV"
    $GIT reset --hard $ORIGIN/$REV
    echo "DONE: updated files in webapp's static repository to"
    $GIT log --pretty=format:"%h %ad %s" -1
}

cd "$SMC_ROOT"
SMC_REV=`git rev-parse --verify HEAD`

case $1 in
    pull)
        webapp_pull $2
        ;;
    push)
        webapp_push
        ;;
    clean)
        cd "$SMC_ROOT"
        rm -rf $WEBAPP.git
        ;;
    *)
        echo "USAGE: $0 [pull|push|clean] [revision]"
        echo "       pull: checks out the compiled static webapp files from the global repository"
        echo "             optionally add a revision as second argument (e.g. master~1) to rollback to the last version"
        echo "       push: after compiling locally, push the new files into the global repository"
        echo "       clean: deletes the local git repo"
        exit 1
esac



