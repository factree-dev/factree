#!/usr/bin/env bash
# Factree's script defaults, in one place (codebase-health R2). Environment variables override them where noted.
FACTREE_PORT_DEFAULT=4747              # the companion's first port to try
FACTREE_REVIEW_EVERY_DEFAULT=300       # seconds between checks of a pull request (FACTREE_WAIT_EVERY)
FACTREE_DECISION_EVERY_DEFAULT=2       # seconds between checks for a companion decision (FACTREE_WAIT_EVERY)
FACTREE_WAIT_FOR_DEFAULT=28800         # seconds before a wait gives up: 8 hours (FACTREE_WAIT_FOR)
FACTREE_CATCHUP_EVERY_DEFAULT=300     # seconds between the session hook's catch-ups on open pull requests (review R11)
