# Jupyter Single-File Editor – Test Suite Notes

Targeted reference for the two Jest suites that cover the single-file CodeMirror editor.

## Files

1. `editor.test.ts`
   - Verifies document building, cell mapping utilities, zero-width-space markers, selection helpers, and the live merge/reassign logic.
   - Integration-style sections assert that gutter labels, markers, and `buildDocumentFromNotebook` stay consistent across mixed cell types and special characters.
   - Recent additions cover the merge filter fixes and mapping realignment helper introduced to prevent accidental merges and duplicate `Out[N]` gutters.
2. `filters.test.ts`
   - Exercises the transaction filters (`createCellMergingFilter`, `createRangeDeletionFilter`, `createMarkerProtectionFilter`, `createPasteDetectionFilter`) with mock documents.
   - Focuses on boundary detection, multi-cell deletions, paste detection via ZWS markers, and regression tests that previously corrupted markers or cell content.

## How to Run

```bash
cd packages/frontend
# Full frontend suite
pnpm test
# Single test file
pnpm test -- --runTestsByPath frame-editors/jupyter-editor/single/__tests__/editor.test.ts
pnpm test -- --runTestsByPath frame-editors/jupyter-editor/single/__tests__/filters.test.ts
```

Use `--runInBand` when worker crashes occur locally; CI defaults usually pass without the flag.

## Maintenance Tips

- When modifying `state.ts` or marker semantics, ensure `editor.test.ts`’s mapping and marker suites still pass; add explicit scenarios there instead of duplicating prose in docs.
- New filters/effects should land alongside unit coverage in `filters.test.ts` so guardrails stay executable.
- Keep the doc and this guide short—point to the actual tests rather than copying code snippets. Updates should mention new areas (e.g., selection highlighting, mapping realignment) directly in the relevant test files.
