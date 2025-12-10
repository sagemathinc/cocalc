# Sync Bugs Plan

Collected current sync-related issues, normalized for tracking and triage. Tags from the report kept for context.

## Easily Reproducible Blockers
- [x] Version numbers go wrong after snapshots in long docs (e.g., `codex.chat`), causing bad history (#blocker #sync).
   - this is indeed total chaos
   - I just took a doc with only 11 snapshots (a chatroom), manually made a snapshot in the browser console.log via: `a = cc.redux.currentEditor().actions; s = a.chatActions['11be4510'].syncdb; s.snapshot(s.versions().slice(-3)[0])`, then refreshed my browser, and edited a bit.  The displayed version numbers count up to 11a, then reset back to 4a and start counting up again.  So the version number assignment is wrong after a snapshot.

- Jupyter kernel state stuck spinning - #blocker #jupyter #sync

- [ ] Most `conat` sync-doc backend tests failing (#blocker #sync).

## Unclear Reproducible Blockers

- [ ] Chat rich/markdown input: recent typing can vanish; may be autosave or editor bug (#blocker #sync).
   - this is not easy to reproduce - I type for an 30 minutes and see it once.  I have seen this many times though.



- Whiteboard: drawing a line hides the previous one until the next draw; likely missing change event (#blocker #sync).
   - can't reproduce this at all right now.
- Memory leak suspected in sync/chat; may be tied to cache size (#blocker #sync).
   - the massive codex chat which I thought kept doing this is currently in a browser tab using under 800MB that has been running for a while.
- Switching between Rich Text and Markdown doesn’t save current version unless defocused (#blocker #sync).  This is ONLY in the whiteboard; in chat it works fine.
   - 
- Code duplication on save-to-disk in `project-host/scripts/remote.sh`; duplications in timetravel until refresh (#blocker #sync).
   - i saw this only once
- First message in chatrooms gets blanked (likely sync rewrite regression) (#unclear #blocker #codex #sync).

- Chat `input.tsx` crash: `syncdb.get_one` can throw; need safe guard (#easy #blocker #bug #0 #lite).
   - haven't seen this in a long time


## Notes / Hypotheses
- Chat disappearing text might be tied to autosave or draft echo handling.
- Memory leak may be cache-size related (lowering to 32 helped backend).
- Version-number drift likely snapshot sequencing/merge logic.

## Next Steps
- Reproduce and log minimal cases for each blocker.
- Fix crash-level issues first (chat input get_one throw, autosave text loss).
- Investigate test failures in `conat` sync-doc to regain coverage.