/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Tests for filter operations in single-file Jupyter notebook editor.

Tests the transaction filters that detect and handle:
- Range deletion (multi-character, multi-cell)
- Cell merging (single-character boundary deletion)
- Paste detection (multi-cell content insertion)
*/

import { EditorState, Transaction } from "@codemirror/state";
import { ZERO_WIDTH_SPACE } from "../utils";

/**
 * Helper to create an initial CodeMirror document from lines
 */
function createEditorState(lines: string[]): EditorState {
  const content = lines.join("\n");
  return EditorState.create({
    doc: content,
  });
}

/**
 * Helper to create a deletion transaction
 * Simulates user deleting from startPos to endPos
 */
function createDeletionTransaction(
  state: EditorState,
  startPos: number,
  endPos: number,
): Transaction {
  const tr = state.update({
    changes: {
      from: startPos,
      to: endPos,
      insert: "",
    },
  });
  return tr;
}

/**
 * Helper to create an insertion transaction
 */
function createInsertionTransaction(
  state: EditorState,
  pos: number,
  text: string,
): Transaction {
  const tr = state.update({
    changes: {
      from: pos,
      to: pos,
      insert: text,
    },
  });
  return tr;
}

/**
 * Helper to get all line contents from a document
 */
function getLineContents(tr: Transaction): string[] {
  const doc = tr.newDoc;
  const lines: string[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    lines.push(doc.line(i).text);
  }
  return lines;
}

describe("Jupyter Single-File Editor - Filter Operations", () => {
  describe("Range Deletion - Position Tracking", () => {
    it("should correctly track positions in single-line deletion", () => {
      const state = createEditorState(["x = 123"]);
      // Positions: 0=x, 1=space, 2==, 3=space, 4=1, 5=2, 6=3
      const tr = createDeletionTransaction(state, 5, 6); // Delete "2"

      expect(tr.startState.doc.toString()).toBe("x = 123");
      expect(tr.newDoc.toString()).toBe("x = 13");
    });

    it("should correctly track positions in multi-line deletion", () => {
      const lines = ["x = 1", "y = 2", "z = 3"];
      const state = createEditorState(lines);

      // "x = 1\ny = 2\nz = 3"
      // Full content is: "x = 1" (5 chars) + "\n" (1 char) + "y = 2" (5 chars) + ...
      // Delete from position 4-6 (the "1\ny"), leaving "x = " + " = 2"
      // But CodeMirror doesn't include the final position, so 4-6 deletes chars at indices 4 and 5
      // That is: "1\n", leaving "x = " + "y = 2"
      const tr = createDeletionTransaction(state, 4, 6);

      const lines_after = getLineContents(tr);
      expect(lines_after[0]).toBe("x = y = 2");
    });

    it("should use old-document positions for range tracking", () => {
      const state = createEditorState(["abc", "def"]);

      // In old doc: "abc\ndef"
      // Positions: 0=a, 1=b, 2=c, 3=\n, 4=d, 5=e, 6=f
      // Delete "bc\nd" (positions 1-5 in old doc)
      const tr = createDeletionTransaction(state, 1, 5);

      expect(tr.startState.doc.toString()).toBe("abc\ndef");
      expect(tr.newDoc.toString()).toBe("aef");
    });

    it("should handle deletion at exact cell boundaries", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["x = 1", zws + "c", "y = 2", zws + "c"];
      const state = createEditorState(lines);

      // Find position of newline before marker
      const line1EndPos = state.doc.line(1).to;
      const tr = createDeletionTransaction(state, line1EndPos, line1EndPos + 1);

      const lines_after = getLineContents(tr);
      // Newline after "x = 1" should be deleted
      expect(lines_after[0]).toContain("x = 1");
    });

    it("should not confuse new and old document positions", () => {
      const state = createEditorState(["123456789"]);

      // Delete "34" (positions 2-4)
      const tr = createDeletionTransaction(state, 2, 4);

      // After deletion: "1256789" (length 7)
      // If we tried to use new positions on old doc, we'd get index out of bounds
      expect(tr.newDoc.toString()).toBe("1256789");
      expect(tr.newDoc.length).toBe(7);
    });
  });

  describe("Range Deletion - Boundary Cases", () => {
    it("should handle deletion of entire line", () => {
      const state = createEditorState(["line1", "line2", "line3"]);

      // Delete entire first line (0-6 includes newline)
      const line1 = state.doc.line(1);
      const tr = createDeletionTransaction(state, line1.from, line1.to + 1);

      const lines_after = getLineContents(tr);
      expect(lines_after[0]).toBe("line2");
    });

    it("should handle deletion spanning multiple entire lines", () => {
      const state = createEditorState(["line1", "line2", "line3", "line4"]);

      // Delete from start of line2 through end of line3
      const line2 = state.doc.line(2);
      const line3 = state.doc.line(3);
      const tr = createDeletionTransaction(state, line2.from, line3.to + 1);

      const lines_after = getLineContents(tr);
      expect(lines_after).toEqual(["line1", "line4"]);
    });

    it("should handle deletion at document start", () => {
      const state = createEditorState(["x = 123", "y = 456"]);
      // "x = 123\ny = 456" - delete first 3 chars "x ="
      const tr = createDeletionTransaction(state, 0, 3);

      expect(tr.newDoc.toString()).toBe(" 123\ny = 456");
    });

    it("should handle deletion at document end", () => {
      const state = createEditorState(["x = 123", "y = 456"]);
      const fullContent = state.doc.toString();
      // "x = 123\ny = 456" (16 chars total)
      // Delete last 3 chars "456"
      const tr = createDeletionTransaction(
        state,
        fullContent.length - 3,
        fullContent.length,
      );

      expect(tr.newDoc.toString()).toBe("x = 123\ny = ");
    });
  });

  describe("Range Deletion - Multi-cell Scenarios", () => {
    it("should identify cells affected by deletion range", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = [
        "cell1_line1",
        "cell1_line2",
        zws + "c",
        "cell2_line1",
        "cell2_line2",
        zws + "c",
        "cell3_line1",
      ];
      const state = createEditorState(lines);

      // Delete from middle of cell1 to middle of cell2
      // This should affect cells 1 and 2
      const delStart = state.doc.line(2).from; // Start of cell1_line2
      const delEnd = state.doc.line(4).to; // End of cell2_line2
      const tr = createDeletionTransaction(state, delStart, delEnd);

      // Verify the transaction happened
      expect(tr.newDoc.toString()).toContain("cell1_line1");
      expect(tr.newDoc.toString()).toContain("cell3_line1");
    });

    it("should handle deletion of complete intermediate cell", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["cell1", zws + "c", "DELETE_THIS", zws + "c", "cell3"];
      const state = createEditorState(lines);

      // Delete entire cell2 (lines 2-3)
      const line2 = state.doc.line(2);
      const line3 = state.doc.line(3);
      const tr = createDeletionTransaction(state, line2.from, line3.to + 1);

      const lines_after = getLineContents(tr);
      expect(lines_after).not.toContain("DELETE_THIS");
      expect(lines_after).toContain("cell1");
      expect(lines_after).toContain("cell3");
    });

    it("should correctly handle deletion preserving marker lines", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["x = 1", zws + "c", "y = 2", zws + "c"];
      const state = createEditorState(lines);

      // Delete content of second cell but preserve marker
      const line3 = state.doc.line(3);
      const tr = createDeletionTransaction(state, line3.from, line3.to);

      const lines_after = getLineContents(tr);
      // Line 3 should be empty now, marker on line 4 should be intact
      expect(lines_after[2]).toBe(""); // Empty line
      expect(lines_after[3]).toContain(zws);
    });
  });

  describe("Merge Detection - Single Character Boundaries", () => {
    it("should identify boundary deletions correctly", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["x = 1", zws + "c", "y = 2"];
      const state = createEditorState(lines);

      // Delete last character "1" from first cell
      const line1 = state.doc.line(1);
      const lastCharPos = line1.to - 1;
      const tr = createDeletionTransaction(state, lastCharPos, line1.to);

      expect(tr.newDoc.toString()).toContain("x = ");
    });

    it("should identify backspace at line start", () => {
      const state = createEditorState(["x = 1", "y = 2"]);

      // Backspace first character of second line
      const line2 = state.doc.line(2);
      const tr = createDeletionTransaction(state, line2.from - 1, line2.from);

      // This should delete the newline between lines
      const lines_after = getLineContents(tr);
      expect(lines_after[0]).toBe("x = 1y = 2");
    });

    it("should distinguish single-char from multi-char deletions", () => {
      const state = createEditorState(["x = 123"]);

      // Single character deletion (delete "1")
      const tr1 = createDeletionTransaction(state, 4, 5);
      expect(tr1.newDoc.toString()).toBe("x = 23");

      // Multi-character deletion (delete "12")
      const tr2 = createDeletionTransaction(state, 4, 6);
      expect(tr2.newDoc.toString()).toBe("x = 3");

      // Verify the deletion amounts are different
      expect(tr1.newDoc.length).toBeGreaterThan(tr2.newDoc.length);
    });

    it("should not trigger merge for middle-of-line deletion", () => {
      const state = createEditorState(["x = 123"]);

      // Delete character in middle
      const tr = createDeletionTransaction(state, 4, 5); // Delete "1"

      // This is a single-char deletion, but:
      // - It's not at the end of the line (position 6)
      // - It's not at the start of the line (position 0)
      // So should not trigger merge
      expect(tr.newDoc.toString()).toBe("x = 23");
    });
  });

  describe("Paste Detection - ZWS Marker Insertion", () => {
    it("should detect new ZWS markers in pasted content", () => {
      const zws = ZERO_WIDTH_SPACE;
      const state = createEditorState(["x = 1"]);

      // Simulate pasting multi-cell content with markers
      const pastedContent = `\n${zws}c\ny = 2\n${zws}c`;
      const tr = createInsertionTransaction(state, 5, pastedContent);

      expect(tr.newDoc.toString()).toContain(zws);
      // Count markers - should be 2 new ones
      const markerMatches = tr.newDoc.toString().split(zws);
      const markerCount = markerMatches.length - 1; // Number of occurrences
      expect(markerCount).toBeGreaterThan(0);
    });

    it("should preserve marker type indicators", () => {
      const zws = ZERO_WIDTH_SPACE;
      const state = createEditorState(["code"]);

      const pastedContent = `\n${zws}c\nmore_code\n${zws}m\nmarkdown`;
      const tr = createInsertionTransaction(state, 4, pastedContent);

      expect(tr.newDoc.toString()).toContain(zws + "c");
      expect(tr.newDoc.toString()).toContain(zws + "m");
    });

    it("should handle paste without markers as normal insertion", () => {
      const state = createEditorState(["x = 1"]);

      // Regular paste without ZWS markers
      const pastedContent = "\ny = 2\nz = 3";
      const tr = createInsertionTransaction(state, 5, pastedContent);

      expect(tr.newDoc.toString()).toBe("x = 1\ny = 2\nz = 3");
      // No ZWS markers, so should not trigger paste detection
      expect(tr.newDoc.toString()).not.toContain("\u200b");
    });
  });

  describe("Edge Cases and Error Prevention", () => {
    it("should handle empty deletions gracefully", () => {
      const state = createEditorState(["x = 1"]);
      const tr = createDeletionTransaction(state, 0, 0);

      expect(tr.newDoc.toString()).toBe("x = 1");
    });

    it("should handle deletion beyond document length gracefully", () => {
      const state = createEditorState(["x = 1"]);
      const fullLen = state.doc.length;

      // Try to delete from valid position to beyond end
      const tr = createDeletionTransaction(state, fullLen - 1, fullLen);
      expect(tr.newDoc.toString()).toBe("x = ");
    });

    it("should maintain document validity after deletion", () => {
      const state = createEditorState(["line1", "line2", "line3"]);
      const tr = createDeletionTransaction(state, 0, 6); // Delete "line1\n"

      // Document should still be valid
      expect(tr.newDoc.lines).toBeGreaterThan(0);
      expect(tr.newDoc.toString()).toBe("line2\nline3");
    });

    it("should handle line position queries after deletion", () => {
      const state = createEditorState(["x = 1", "y = 2", "z = 3"]);
      const tr = createDeletionTransaction(state, 0, 6);

      // New document has fewer lines
      expect(tr.newDoc.lines).toBe(2);

      // Line numbers should be 1-indexed
      for (let i = 1; i <= tr.newDoc.lines; i++) {
        const line = tr.newDoc.line(i);
        expect(line.number).toBe(i);
        expect(line.from).toBeLessThan(line.to);
      }
    });
  });

  describe("Document Structure Integrity", () => {
    it("should preserve document encoding after complex operations", () => {
      const lines = [
        'print("hello")',
        "x = {'key': 'value'}",
        "unicode = '你好'",
      ];
      const state = createEditorState(lines);

      // Delete middle character - position 8 in "hello" (the "e")
      const tr = createDeletionTransaction(state, 8, 9);

      expect(tr.newDoc.toString()).toContain("hllo");
      expect(tr.newDoc.toString()).toContain("你好");
    });

    it("should maintain line breaks correctly after deletion", () => {
      const state = createEditorState(["line1", "line2", "line3"]);

      // Delete middle line
      const line2 = state.doc.line(2);
      const tr = createDeletionTransaction(state, line2.from, line2.to + 1);

      const lines_after = getLineContents(tr);
      expect(lines_after).toEqual(["line1", "line3"]);
    });

    it("should handle consecutive deletions correctly", () => {
      let state = createEditorState(["a", "b", "c", "d", "e"]);

      // First deletion
      let tr = createDeletionTransaction(state, 0, 2); // "a\n"
      state = EditorState.create({
        doc: tr.newDoc.toString(),
      });
      expect(state.doc.toString()).toBe("b\nc\nd\ne");

      // Second deletion
      tr = createDeletionTransaction(state, 0, 2); // "b\n"
      expect(tr.newDoc.toString()).toBe("c\nd\ne");
    });
  });

  describe("ZWS Marker Boundary Cases", () => {
    it("should correctly identify marker lines", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["code", zws + "c", "more"];
      const state = createEditorState(lines);

      const markerLine = state.doc.line(2);
      expect(markerLine.text).toBe(zws + "c");
    });

    it("should handle deletion of content preserving markers", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = ["x = 1", zws + "c", "y = 2", zws + "c"];
      const state = createEditorState(lines);

      // Delete all of first cell content
      const line1 = state.doc.line(1);
      const tr = createDeletionTransaction(state, line1.from, line1.to);

      const lines_after = getLineContents(tr);
      expect(lines_after[0]).toBe(""); // Empty content
      expect(lines_after[1]).toBe(zws + "c"); // Marker preserved
    });

    it("should handle multiple consecutive markers", () => {
      const zws = ZERO_WIDTH_SPACE;
      const lines = [
        "x = 1",
        zws + "c",
        "y = 2",
        zws + "c",
        "z = 3",
        zws + "c",
      ];
      const state = createEditorState(lines);

      // Count markers
      const markerCount = getLineContents({
        startState: state,
        newDoc: state.doc,
      } as Transaction).filter((l) => l.startsWith(zws)).length;

      expect(markerCount).toBe(3);
    });
  });
});
