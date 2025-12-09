# Sync Bugs Plan

Collected current sync-related issues, normalized for tracking and triage. Tags from the report kept for context.

## Blockers
- Jupyter kernel state stuck spinning - #blocker #jupyter #sync
- Whiteboard: drawing a line hides the previous one until the next draw; likely missing change event (#blocker #sync).
- Chat rich/markdown input: recent typing can vanish; may be autosave or editor bug (#blocker #sync).
- Memory leak suspected in sync/chat; may be tied to cache size (#blocker #sync).
- Switching between Rich Text and Markdown doesn’t save current version unless defocused (#blocker #sync).
- Code duplication on save-to-disk in `project-host/scripts/remote.sh`; duplications in timetravel until refresh (#blocker #sync).
- Most `conat` sync-doc backend tests failing (#blocker #sync).
- Version numbers go wrong after snapshots in long docs (e.g., `codex.chat`), causing bad history (#blocker #sync).
- First message in chatrooms gets blanked (likely sync rewrite regression) (#unclear #blocker #codex #sync).
- Autosave causes text to disappear in CodeMirror editors when interval is short; possibly live buffer vs save mismatch (#files #bug #0 #sync #blocker).
- Chat `input.tsx` crash: `syncdb.get_one` can throw; need safe guard (#easy #blocker #bug #0 #lite).


## Notes / Hypotheses
- Chat disappearing text might be tied to autosave or draft echo handling.
- Memory leak may be cache-size related (lowering to 32 helped backend).
- Version-number drift likely snapshot sequencing/merge logic.

## Next Steps
- Reproduce and log minimal cases for each blocker.
- Fix crash-level issues first (chat input get_one throw, autosave text loss).
- Investigate test failures in `conat` sync-doc to regain coverage.