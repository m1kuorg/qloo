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

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
remote=$(git -C "$repo" remote get-url origin)
# One read of the pull request, so its title and commits agree.
view=$(gh pr view "$pr" --repo "$remote" --json number,title,baseRefOid,headRefOid)
base=$(jq -r .baseRefOid <<<"$view")
head=$(jq -r .headRefOid <<<"$view")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone --quiet --no-checkout --no-local "$repo" "$work/repo"
# The job reads the repository's name from origin, so it's GitHub's, not this checkout's path.
git -C "$work/repo" remote set-url origin "$remote"
git -C "$work/repo" fetch --quiet origin "$base" "$head"
# GitHub keeps the merge ref while the pull request merges cleanly; without it, rebase first.
git -C "$work/repo" fetch --quiet origin "refs/pull/$pr/merge" || {
  echo "#$pr has no merge ref: it conflicts with its base, so rebase it first" >&2
  exit 1
}
git -C "$work/repo" checkout --quiet --detach FETCH_HEAD
jq '{number, pull_request: {number, title, base: {sha: .baseRefOid}, head: {sha: .headRefOid}}}' \
  <<<"$view" >"$work/event.json"

echo "CI for #$pr, head ${head:0:7} merged into ${base:0:7}: $(jq -r .title <<<"$view")"
cd "$work/repo"
act pull_request --workflows .github/workflows/ci.yml --eventpath "$work/event.json" \
  --platform ubuntu-latest=catthehacker/ubuntu:act-latest --container-architecture linux/amd64 \
  --container-options "--cpuset-cpus=0-3 --memory=6g"
