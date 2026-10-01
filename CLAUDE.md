# CLAUDE.md

## Guro paper-plane video (Higgsfield) — mandatory rules
Any Higgsfield work for the "구로 청소년축제 종이비행기 원테이크" video MUST follow
`production/guro-paper-plane/wiki/README.md` and the gate in `production/guro-paper-plane/harness/`.

- Start of session: install the hook (`mkdir -p .claude && cp production/guro-paper-plane/harness/claude-settings.json .claude/settings.json`) and run the self-test (wiki/03-workflow.md G0).
- Never hand-write a credit-spending Higgsfield request. Build it from a spec (`hfgate.py build/lint/approve`), report cost + diff to the user, get an explicit OK (`confirm --quote`), then send `build/<spec>.tool_input.json` verbatim.
- Change only what the user asked for (lint L9). Every visible location gets its reference image (L2). No end_image in one-take segments (L3). No swing/pivot/backward camera moves (L13).
- After every generation run the QA command (`hfgate.py qa-cmd`) in the Higgsfield sandbox and show the user before `accept`.
- Answer the user in Korean; separate fact from inference and mark uncertainty.

The rest of this repository is the youcan-stage landing site (static HTML + Vercel functions); `production/` is excluded from deploys via `.vercelignore`.
