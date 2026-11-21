# /factree:init test cases

Run each case in scratch folders with the plugin installed. Note results in the table at the bottom.

## A parent folder [workspace-setup#R4.S1]

**Setup:** git repos `~/work/acme/api` and `~/work/acme/web`, no workspace anywhere.
**Expect:** `/factree:init` in `api`, choosing the parent folder, creates `~/work/acme/.factree/`; `.factree/` is excluded in both repos' `.git/info/exclude`; `git status` is clean in both; a spec started in `web` uses that workspace.

## A central folder [workspace-setup#R4.S2]

**Setup:** choose `~/factree` as a central workspace.
**Expect:** `~/factree/` is created; Claude gives the exact line `export FACTREE_HOME=~/factree` for the shell profile and edits nothing of the user's.

## Already set up [workspace-setup#R4.S3]

**Setup:** a workspace with 3 specs and `review_budget: 300`.
**Expect:** changing the budget to 200 leaves the 3 specs untouched and `preferences.md` says `review_budget: 200`.

---

## Results

| Date | Plugin version | Case | Pass? | Notes |
|---|---|---|---|---|
