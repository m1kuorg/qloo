#!/usr/bin/env bash
# Runs CI, .github/workflows/ci.yml, on this machine with act for one pull request, as GitHub would on
# its head commit: GitHub's hosted runners don't run this repo's workflows (#368), so this is the check
# a PR passes before it merges (apps/README.md, "CI"). It clones the repo afresh at the PR's head into a
# scratch folder, since a worktree's .git is a file the job's container can't follow, and gives act the
# PR's number, title and base and head commits, which the PR title and Secrets steps read. The job runs
# on 4 of Docker's CPUs and in 6 GB, so the suite leaves the machine room, as amd64, which the Secrets
# step's gitleaks download is built for.
# Usage: scripts/ci.sh <pr number>. Needs gh, jq, act, and Docker running.
set -euo pipefail

pr=${1:?usage: scripts/ci.sh <pr number>}
for tool in gh jq act docker; do
  command -v "$tool" >/dev/null || {
    echo "scripts/ci.sh needs $tool" >&2
    exit 1
  }
done

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
read -r base head < <(gh pr view "$pr" --repo m1kuorg/qloo --json baseRefOid,headRefOid --jq '"\(.baseRefOid) \(.headRefOid)"')
title=$(gh pr view "$pr" --repo m1kuorg/qloo --json title --jq .title)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone --quiet --no-local "$repo" "$work/repo"
git -C "$work/repo" fetch --quiet https://github.com/m1kuorg/qloo.git "$base" "$head"
git -C "$work/repo" checkout --quiet --detach "$head"
jq -n --argjson n "$pr" --arg t "$title" --arg b "$base" --arg h "$head" \
  '{pull_request: {number: $n, title: $t, base: {sha: $b}, head: {sha: $h}}}' >"$work/event.json"

echo "CI for #$pr at ${head:0:7}: $title"
cd "$work/repo"
act pull_request --eventpath "$work/event.json" \
  --platform ubuntu-latest=catthehacker/ubuntu:act-latest --container-architecture linux/amd64 \
  --container-options "--cpuset-cpus=0-3 --memory=6g"
