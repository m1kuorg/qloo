#!/usr/bin/env bash
# Runs CI, .github/workflows/ci.yml, on this machine with act for one pull request, on the commit GitHub
# would test: its merge ref, the pull request merged into its base branch's tip. GitHub's hosted runners
# don't run this repo's workflows (#368), so this is the check a pull request passes before it merges
# (apps/README.md, "CI"). It clones the repo afresh into a scratch folder, since a worktree's .git is a
# file the job's container can't follow, and fetches the merge ref and the pull request's base and head
# commits, which the Secrets step's gitleaks reads between. It gives act the pull request's number,
# title, and base and head commits, as GitHub's event does. The job runs as amd64, the build the Secrets
# step downloads, on 4 of Docker's CPUs and in 6 GB, so the suite leaves the machine room: pinned CPUs,
# since the suite starts a worker for each CPU it sees.
# act names the job's container and its volumes after the workflow's name and the job, so two runs at
# once would share them, and the second would find the first's workspace. Each run gives its own copy of
# the workflow a name of its own, so a run never joins another's, even one an older copy of this script
# started, and removes its container and volumes when it ends. Runs still go one at a time, across
# sessions, since the suite is heavy: a run waits on a lock the last run holds until it ends, which a run
# that was killed leaves behind with its process gone, so it's taken over; then it waits on any act
# started by hand.
# Usage: scripts/ci.sh <pr number>. Needs gh, jq, act, and Docker running.
set -euo pipefail

pr=${1:-}
[[ $pr =~ ^[0-9]+$ ]] || {
  echo 'usage: scripts/ci.sh <pr number>' >&2
  exit 1
}
for tool in gh jq act docker; do
  command -v "$tool" >/dev/null || {
    echo "scripts/ci.sh needs $tool" >&2
    exit 1
  }
done
docker info >/dev/null 2>&1 || {
  echo 'scripts/ci.sh needs Docker running' >&2
  exit 1
}

# Reads the pull request once GitHub knows whether it merges: it works that out after a push or a merge
# to the base, and answers UNKNOWN until then. A pull request that conflicts stops here.
read_view() {
  local view
  for _ in $(seq 1 12); do
    view=$(gh pr view "$pr" --repo "$remote" --json number,title,baseRefName,baseRefOid,headRefOid,mergeable)
    [[ $(jq -r .mergeable <<<"$view") != UNKNOWN ]] && break
    sleep 5
  done
  case $(jq -r .mergeable <<<"$view") in
    MERGEABLE) echo "$view" ;;
    CONFLICTING)
      echo "#$pr conflicts with its base, so rebase it first" >&2
      return 1
      ;;
    *)
      echo "GitHub hasn't worked out whether #$pr merges; try again in a minute" >&2
      return 1
      ;;
  esac
}
repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
remote=$(git -C "$repo" remote get-url origin)
# Once before waiting for another run, so a pull request that conflicts doesn't wait, and again after.
read_view >/dev/null

lock=${TMPDIR:-/tmp}/crossfeed-ci.lock
until mkdir "$lock" 2>/dev/null; do
  holder=$(cat "$lock/pid" 2>/dev/null || true)
  if [[ -n $holder ]] && ! kill -0 "$holder" 2>/dev/null; then
    rm -rf "$lock"
    continue
  fi
  echo "Waiting for another CI run${holder:+ (pid $holder)} to end; its lock is $lock"
  sleep 30
done
echo $$ >"$lock/pid"
work=$(mktemp -d)
run="CI-$pr-$$"
# Removes what act made for this run, then the scratch folder and the lock. A run killed outright leaves
# its container and volumes, named act-CI-<pr>-<pid>-…, for `docker rm` and `docker volume rm` by hand.
clean() {
  docker ps --all --quiet --filter "name=act-$run-" | xargs -r docker rm --force >/dev/null
  docker volume ls --quiet --filter "name=act-$run-" | xargs -r docker volume rm >/dev/null
  rm -rf "$work" "$lock"
}
trap clean EXIT
while pgrep -x act >/dev/null; do
  echo 'Waiting for an act run started by hand to end'
  sleep 30
done

view=$(read_view)
base=$(jq -r .baseRefOid <<<"$view")
head=$(jq -r .headRefOid <<<"$view")

git clone --quiet --no-checkout --no-local "$repo" "$work/repo"
# The job reads the repository's name from origin, so it's GitHub's, not this checkout's path.
git -C "$work/repo" remote set-url origin "$remote"
git -C "$work/repo" fetch --quiet origin "$base" "$head"
# GitHub keeps the merge ref while the pull request merges cleanly; without it, rebase first.
git -C "$work/repo" fetch --quiet origin "refs/pull/$pr/merge" || {
  echo "#$pr has no merge ref: it conflicts with its base, so rebase it first" >&2
  exit 1
}
# On a branch of its own, not detached: a clone of a detached checkout has an empty refs/, which act's
# copy into the job's container leaves out, and git there won't take a .git without refs/ as a repo.
git -C "$work/repo" checkout --quiet -B "pr-$pr" FETCH_HEAD
jq '{number, pull_request: {number, title, base: {sha: .baseRefOid}, head: {sha: .headRefOid}}}' \
  <<<"$view" >"$work/event.json"

# The merge ref's first parent is the base branch's tip GitHub merged the head into. GitHub remakes the
# ref a moment after the base moves, so one made before the base's latest merge would test old code.
tip=$(git -C "$work/repo" rev-parse HEAD^1)
latest=$(git ls-remote "$remote" "refs/heads/$(jq -r .baseRefName <<<"$view")" | cut -f1)
[[ $tip == "$latest" ]] || {
  echo "#$pr's merge ref is on ${tip:0:7}, but its base is at ${latest:0:7}; try again in a minute" >&2
  exit 1
}
echo "CI for #$pr, head ${head:0:7} merged into ${tip:0:7}: $(jq -r .title <<<"$view")"
cd "$work/repo"
sed "1s/^name: CI$/name: $run/" .github/workflows/ci.yml >"$work/ci.yml"
grep -q "^name: $run$" "$work/ci.yml" || {
  echo 'scripts/ci.sh expects ci.yml to open with "name: CI"' >&2
  exit 1
}
act pull_request --workflows "$work/ci.yml" --eventpath "$work/event.json" \
  --platform ubuntu-latest=catthehacker/ubuntu:act-latest --container-architecture linux/amd64 \
  --container-options "--cpuset-cpus=0-3 --memory=6g"
