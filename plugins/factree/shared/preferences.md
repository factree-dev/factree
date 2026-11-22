# Factree preferences
#
# Copy this file to <workspace>/preferences.md (e.g. .factree/preferences.md) and commit it,
# so your team shares the same defaults. Uncomment a line to set it. A missing file or key
# means the default. Every decision a preference makes is recorded as "preference: <key>".

# approve_plans: ask
#   Only with flow: step. With flow: auto (the default), a spec or plan with nothing open is
#   approved by the flow and the work carries on; only open decisions stop it.
#   ask          With flow: step, a person approves every plan. (default)
#   nothing-new  With flow: step, /factree:plan approves a plan itself when its design adds no
#                new pattern, dependency or lens. Anything new is still asked.

# flow: auto
#   auto  Each stage goes straight on to the next once nothing needs you: an approved spec is
#         planned, an approved plan is built, a finished build is sent for review. It stops only for
#         your decisions and a failed or blocked task. (default)
#   step  Stop after every stage and say which comes next.
#   Merging always stays yours.

# update_branch: merge
#   How a pull request's branch catches up with its base when they conflict. Only used when the
#   repo profile, GitHub's allowed merge methods and the repo's docs don't already say. Claude
#   asks once and saves the answer here.
#   merge   Merge the base into the branch; no force-push, reviewers' comments stay attached.
#   rebase  Rebase the branch onto the base and force-push with lease.

# review_budget: 300
#   The most changed lines per task, tests included (lockfiles and generated files excluded).
#   A number given in the conversation wins. (default 300)
