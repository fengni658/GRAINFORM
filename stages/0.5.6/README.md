# 0.5.6 lifecycle WIP checkpoint

Frozen source with 18 runtime files. Run npm test in this directory after installing the pinned native canvas test dependency. candidate/ is the runnable static application. Root repository runtime remains the prior baseline; this checkpoint is intentionally isolated under stages/0.5.6.

Scope: lifecycle command races interrupted by blur or dialogs; preserve the 0.5.5 startup visibility repair and all material/physics changes. Fifteen runtime files remain byte-identical to the hotfix baseline. Includes baseline and pre-hotfix fixtures for expected negative tests. No 0.5.7 or later changes.

Local author validation: 36 contracts passed. Independent cloud verification and natural browser background lifecycle are pending at this checkpoint; do not call it an accepted release. Tests use controlled DOM/event-loop doubles and production app/worker/native Canvas. No main or private Site changes.
