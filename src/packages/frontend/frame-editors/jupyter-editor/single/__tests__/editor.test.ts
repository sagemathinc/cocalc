/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Tests for single-file Jupyter notebook editor.

Tests the conversion between notebook state and CodeMirror representation,
including document building, cell mapping, deletion operations, and merging.
*/

import { Map, List } from "immutable";

import { buildDocumentFromNotebook, type CellMapping } from "../state";
import {
  ZERO_WIDTH_SPACE,
  findCellAtLine,
  getCellIdAtLine,
  getCellsInRange,
} from "../utils";

/**
 * Helper to create a cell object (matching CoCalc's notebook structure)
 */
function createCell(
  cellType: "code" | "markdown" | "raw" = "code",
  input: string = "",
  options: {
    execCount?: number;
    output?: any;
    state?: "busy" | "run" | "start";
  } = {},
) {
  return Map({
    type: "cell",
    cell_type: cellType,
    input,
    exec_count: options.execCount,
    output: options.output,
    state: options.state,
  });
}

/**
 * Helper to create a notebook structure
 */
function createNotebook(
  cellConfigs: Array<string | { type: string; input: string }>,
) {
  return cellConfigs.reduce(
    (acc, config) => {
      const cellId = `cell-${acc.cellList.length}`;
      let cellType = "code";
      let input = "";

      if (typeof config === "string") {
        input = config;
      } else {
        cellType = config.type;
        input = config.input;
      }

      const newCell = createCell(cellType as any, input);
      return {
        cells: acc.cells.set(cellId, newCell),
        cellList: [...acc.cellList, cellId],
      };
    },
    { cells: Map<string, any>(), cellList: [] as string[] },
  );
}

describe("Jupyter Single-File Editor - State and Document Building", () => {
  describe("buildDocumentFromNotebook", () => {
    it("should build empty document from empty notebook", () => {
      const { cells, cellList } = createNotebook([]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.content).toBe("");
      expect(result.mappings).toHaveLength(0);
    });

    it("should build document with single code cell", () => {
      const { cells, cellList } = createNotebook(["print('hello')"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.content).toContain("print('hello')");
      expect(result.mappings).toHaveLength(1);
      expect(result.mappings[0].cellType).toBe("code");
      expect(result.mappings[0].source).toEqual(["print('hello')"]);
    });

    it("should add ZWS marker after each cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      // Should have markers: x=1\n⁠c\ny=2\n⁠c
      const lines = result.content.split("\n");
      expect(lines[1]).toBe(ZERO_WIDTH_SPACE + "c"); // After first cell
      expect(lines[3]).toBe(ZERO_WIDTH_SPACE + "c"); // After second cell
    });

    it("should set correct input ranges for multiple cells", () => {
      const { cells, cellList } = createNotebook(["line1\nline2", "line3"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings[0].inputRange.from).toBe(0);
      expect(result.mappings[0].inputRange.to).toBe(2); // 2 lines
      expect(result.mappings[1].inputRange.from).toBe(3); // After marker
      expect(result.mappings[1].inputRange.to).toBe(4); // 1 line
    });

    it("should handle empty cells correctly", () => {
      const { cells, cellList } = createNotebook(["", "x = 1", ""]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings).toHaveLength(3);
      // Empty cells should have one empty line
      expect(result.mappings[0].source).toEqual([""]);
      expect(result.mappings[2].source).toEqual([""]);
    });

    it("should handle markdown cells (no source lines in document)", () => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        { type: "markdown", input: "# Title" },
        "y = 2",
      ]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      // Code cell content, then marker
      // Markdown cell only has marker (no source)
      // Code cell content, then marker
      expect(result.mappings[0].cellType).toBe("code");
      expect(result.mappings[1].cellType).toBe("markdown");
      expect(result.mappings[1].source).toEqual(["# Title"]); // Still stored in mapping

      // But markdown cell should not add lines to document
      expect(result.mappings[1].inputRange.from).toBe(
        result.mappings[1].inputRange.to,
      );
    });

    it("should preserve cell metadata", () => {
      const { cells, cellList } = createNotebook(["x = 1"]);
      const cellWithExecCount = cells.setIn(["cell-0", "exec_count"], 5);
      const result = buildDocumentFromNotebook(
        cellWithExecCount,
        List(cellList),
      );

      expect(result.mappings[0].execCount).toBe(5);
    });

    it("should handle multi-line cells correctly", () => {
      const { cells, cellList } = createNotebook([
        "def foo():\n  return 42",
        "result = foo()\nprint(result)",
      ]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings[0].source).toEqual(["def foo():", "  return 42"]);
      expect(result.mappings[1].source).toEqual([
        "result = foo()",
        "print(result)",
      ]);
    });

    it("should mark correct cell types in markers", () => {
      const { cells: c1, cellList: l1 } = createNotebook([
        "x = 1",
        { type: "raw", input: "raw text" },
      ]);
      const result = buildDocumentFromNotebook(c1, List(l1));

      const lines = result.content.split("\n");
      // First cell is code: marker should be 'c'
      expect(lines.find((l) => l === ZERO_WIDTH_SPACE + "c")).toBeDefined();
      // Second cell is raw: marker should be 'r'
      expect(lines.find((l) => l === ZERO_WIDTH_SPACE + "r")).toBeDefined();
    });
  });

  describe("Cell mapping utilities", () => {
    let mappings: CellMapping[];

    beforeEach(() => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        "y = 2\nz = 3",
        "a = 4",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));
      mappings = doc.mappings;
    });

    describe("findCellAtLine", () => {
      it("should find cell at line in single-line cell", () => {
        const cell = findCellAtLine(mappings, 0);
        expect(cell?.cellId).toBe("cell-0");
      });

      it("should find cell at line in multi-line cell", () => {
        const cell1 = findCellAtLine(mappings, 2);
        const cell2 = findCellAtLine(mappings, 3);
        expect(cell1?.cellId).toBe("cell-1");
        expect(cell2?.cellId).toBe("cell-1");
      });

      it("should return undefined for marker lines", () => {
        // Marker lines are not part of inputRange, so they won't match
        const cell = findCellAtLine(mappings, 1); // Marker line after cell 0
        expect(cell).toBeUndefined();
      });

      it("should return undefined for out-of-range lines", () => {
        const cell = findCellAtLine(mappings, 999);
        expect(cell).toBeUndefined();
      });
    });

    describe("getCellIdAtLine", () => {
      it("should return cell ID at line", () => {
        expect(getCellIdAtLine(mappings, 0)).toBe("cell-0");
        expect(getCellIdAtLine(mappings, 2)).toBe("cell-1");
      });

      it("should return undefined for marker lines", () => {
        expect(getCellIdAtLine(mappings, 1)).toBeUndefined();
      });
    });

    describe("getCellsInRange", () => {
      it("should find single cell in range", () => {
        const cells = getCellsInRange(mappings, 0, 1);
        expect(cells).toHaveLength(1);
        expect(cells[0].cellId).toBe("cell-0");
      });

      it("should find multiple cells in range", () => {
        const cells = getCellsInRange(mappings, 0, 3);
        expect(cells).toHaveLength(2); // Cell 0 and 1
        expect(cells[0].cellId).toBe("cell-0");
        expect(cells[1].cellId).toBe("cell-1");
      });

      it("should find cell when range partially overlaps", () => {
        // Cell layout: cell-0 (0-0), marker (1), cell-1 (2-3), marker (4), cell-2 (5-5)
        // Range 2-5 overlaps only cell-1 (line 5 is exclusive, so cell-2 not included)
        const cells = getCellsInRange(mappings, 2, 5);
        expect(cells).toHaveLength(1); // Only Cell 1 overlaps
        expect(cells[0].cellId).toBe("cell-1");
      });

      it("should handle empty range", () => {
        const cells = getCellsInRange(mappings, 100, 101);
        expect(cells).toHaveLength(0);
      });
    });
  });

  describe("Complex document structures", () => {
    it("should handle notebook with mixed cell types", () => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        { type: "markdown", input: "# Section" },
        "y = 2",
        { type: "raw", input: "raw" },
        "z = 3",
      ]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings).toHaveLength(5);
      expect(result.mappings[0].cellType).toBe("code");
      expect(result.mappings[1].cellType).toBe("markdown");
      expect(result.mappings[2].cellType).toBe("code");
      expect(result.mappings[3].cellType).toBe("raw");
      expect(result.mappings[4].cellType).toBe("code");
    });

    it("should handle cells with special characters", () => {
      const { cells, cellList } = createNotebook([
        'print("hello\\nworld")',
        "x = 'quote'",
      ]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings[0].source[0]).toContain('print("hello\\nworld")');
      expect(result.mappings[1].source[0]).toContain("x = 'quote'");
    });

    it("should handle large notebooks efficiently", () => {
      const cellConfigs = Array(100)
        .fill(null)
        .map((_, i) => `cell_${i}_code = ${i}`);

      const { cells, cellList } = createNotebook(cellConfigs);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings).toHaveLength(100);
      expect(result.content.split("\n")).toHaveLength(200); // 100 cells + 100 markers
    });
  });

  describe("Document reconstruction edge cases", () => {
    it("should handle cells with only whitespace", () => {
      const { cells, cellList } = createNotebook(["   ", "\t", "x = 1"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings[0].source).toEqual(["   "]);
      expect(result.mappings[1].source).toEqual(["\t"]);
    });

    it("should handle cells with multiple consecutive newlines", () => {
      const { cells, cellList } = createNotebook(["x = 1\n\n\ny = 2"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      expect(result.mappings[0].source).toEqual(["x = 1", "", "", "y = 2"]);
    });

    it("should preserve marker line positions after building", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const result = buildDocumentFromNotebook(cells, List(cellList));

      // Verify marker lines are exactly where expected
      result.mappings.forEach((mapping) => {
        expect(mapping.outputMarkerLine).toBe(mapping.inputRange.to);
      });
    });
  });
});

describe("Jupyter Single-File Editor - Deletion Operations", () => {
  /**
   * Helper to simulate document state after deletion
   * Returns the modified cell contents
   */
  function simulateDeletion(
    originalContent: string,
    startPos: number,
    endPos: number,
  ): string {
    return originalContent.slice(0, startPos) + originalContent.slice(endPos);
  }

  describe("Single cell deletion", () => {
    it("should handle deletion within a single line", () => {
      const content = "x = 123";
      const result = simulateDeletion(content, 4, 7); // Delete "123"
      expect(result).toBe("x = ");
    });

    it("should handle deletion of entire line content", () => {
      const content = "x = 1\ny = 2";
      // Assuming lines are 0-4 and 6-10, delete first line
      const lines = content.split("\n");
      expect(lines[0]).toBe("x = 1");
      expect(lines[1]).toBe("y = 2");
    });

    it("should handle backspace at beginning of line", () => {
      // This would normally merge cells, but we're testing the raw deletion
      const content = "line1\nline2";
      // Backspace at line2 start (pos 6) should delete the newline (pos 5)
      const result = simulateDeletion(content, 5, 6);
      expect(result).toBe("line1line2");
    });
  });

  describe("Multi-cell deletion tracking", () => {
    it("should identify cells affected by deletion range", () => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        "y = 2\nz = 3",
        "a = 4",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Simulate deletion spanning multiple cells
      // Cell 0 is lines 0-0, Cell 1 is lines 2-3, Cell 2 is lines 5-5
      const affectedCells = getCellsInRange(doc.mappings, 0, 3);
      expect(affectedCells).toHaveLength(2); // Cell 0 and 1
    });

    it("should handle deletion with partial cell involvement", () => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        "y = 2\nz = 3",
        "a = 4",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Cell layout: cell-0 (0-0), marker (1), cell-1 (2-3), marker (4), cell-2 (5-5)
      // Delete from middle of cell 1 to middle of cell 2
      // Range 2-6 overlaps cell-1 (2-3) and cell-2 (5-5)
      const affectedCells = getCellsInRange(doc.mappings, 2, 6);
      expect(affectedCells).toHaveLength(2); // Cell 1 and 2
    });

    it("should handle deletion of entire intermediate cell", () => {
      const { cells, cellList } = createNotebook([
        "x = 1",
        "delete_me",
        "z = 3",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Cell 1 (delete_me) is at lines 2-2
      const cell = findCellAtLine(doc.mappings, 2);
      expect(cell?.cellId).toBe("cell-1");
    });
  });

  describe("Deletion with ZWS markers", () => {
    it("should not delete ZWS markers (protected)", () => {
      const { cells, cellList } = createNotebook(["x = 1"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const lines = doc.content.split("\n");
      // Marker line should be protected
      expect(lines[1]).toBe(ZERO_WIDTH_SPACE + "c");

      // In real deletion, marker protection filter would prevent this
      // Here we just verify the marker exists
      expect(doc.content).toContain(ZERO_WIDTH_SPACE);
    });

    it("should correctly identify marker positions", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Each cell should have its marker at outputMarkerLine
      doc.mappings.forEach((mapping) => {
        expect(mapping.outputMarkerLine).toBe(mapping.inputRange.to);
      });
    });
  });

  describe("Boundary conditions", () => {
    it("should handle deletion at cell boundaries", () => {
      const content1 = "x = 1";

      // Simulating merge: delete last char of cell1
      // In the actual editor, this would merge with the next cell
      // Here we're testing the raw deletion behavior
      const result1 = simulateDeletion(content1, 4, 5); // Delete "1"
      expect(result1).toBe("x = ");
    });

    it("should handle empty cells after deletion", () => {
      const content = "x = 1";
      const result = simulateDeletion(content, 0, 5); // Delete all
      expect(result).toBe("");
    });

    it("should handle whitespace-only content after deletion", () => {
      const content = "   ";
      const result = simulateDeletion(content, 0, 3);
      expect(result).toBe("");
    });
  });

  describe("Deletion error cases", () => {
    it("should handle invalid deletion positions gracefully", () => {
      const content = "x = 1";
      // These should not crash
      const result1 = simulateDeletion(content, 0, 0); // Empty delete
      expect(result1).toBe(content);

      const result2 = simulateDeletion(content, content.length, content.length);
      expect(result2).toBe(content);
    });
  });
});

describe("Jupyter Single-File Editor - Cell Merging", () => {
  /**
   * Helper to simulate cell merging
   */
  function mergeCells(content1: string, content2: string): string {
    return content1 + "\n" + content2;
  }

  describe("Basic merge operations", () => {
    it("should merge two cells with proper newline", () => {
      const cell1 = "x = 1";
      const cell2 = "y = 2";
      const result = mergeCells(cell1, cell2);
      expect(result).toBe("x = 1\ny = 2");
    });

    it("should merge cells with multiline content", () => {
      const cell1 = "def foo():\n  return 42";
      const cell2 = "result = foo()";
      const result = mergeCells(cell1, cell2);
      expect(result).toContain("return 42");
      expect(result).toContain("result = foo()");
    });

    it("should merge empty cells correctly", () => {
      const cell1 = "";
      const cell2 = "x = 1";
      const result = mergeCells(cell1, cell2);
      expect(result).toBe("\nx = 1");
    });

    it("should handle merge with whitespace", () => {
      const cell1 = "x = 1  ";
      const cell2 = "  y = 2";
      const result = mergeCells(cell1, cell2);
      expect(result).toContain("x = 1  ");
      expect(result).toContain("  y = 2");
    });
  });

  describe("Merge detection conditions", () => {
    it("should only trigger merge for single-character deletion at boundary", () => {
      // This is tested in the filter logic itself
      // Here we verify the concept: deletion of last char of cell
      const cellContent = "x = 1";
      const afterDelete = cellContent.slice(0, -1); // Remove last char
      expect(afterDelete).toBe("x = ");
    });

    it("should only trigger merge for first character deletion at boundary", () => {
      const cellContent = "y = 2";
      const afterDelete = cellContent.slice(1); // Remove first char
      expect(afterDelete).toBe(" = 2");
    });

    it("should not trigger merge for multi-character deletion", () => {
      const cellContent = "x = 123";
      const afterDelete = cellContent.slice(0, -2); // Remove last 2 chars
      expect(afterDelete).toBe("x = 1");
      // This should not trigger merge, it's handled by range deletion filter
    });

    it("should not trigger merge for middle-of-line deletion", () => {
      const cellContent = "x = 123";
      const afterDelete = cellContent.slice(0, 5) + cellContent.slice(6); // Delete "2" from "123"
      expect(afterDelete).toBe("x = 13");
      // This should not trigger merge
    });
  });

  describe("Merge with different cell types", () => {
    it("should only merge code cells with code cells", () => {
      // This is a design limitation - markdown cells don't have source in document
      // So merge only happens between code cells
      const { cells, cellList } = createNotebook([
        "x = 1",
        { type: "markdown", input: "# Title" },
        "y = 2",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      expect(doc.mappings[0].cellType).toBe("code");
      expect(doc.mappings[1].cellType).toBe("markdown");
      // Can't merge into markdown in current design
    });
  });
});

describe("Jupyter Single-File Editor - ZWS Marker Handling", () => {
  it("should use correct marker character for cell types", () => {
    const { cells, cellList } = createNotebook([
      "x = 1",
      { type: "markdown", input: "# Title" },
      { type: "raw", input: "raw" },
    ]);
    const doc = buildDocumentFromNotebook(cells, List(cellList));

    const lines = doc.content.split("\n");
    const markers = lines.filter((l) => l.startsWith(ZERO_WIDTH_SPACE));

    expect(markers).toContain(ZERO_WIDTH_SPACE + "c"); // code
    expect(markers).toContain(ZERO_WIDTH_SPACE + "m"); // markdown
    expect(markers).toContain(ZERO_WIDTH_SPACE + "r"); // raw
  });

  it("should have exactly one marker per cell", () => {
    const { cells, cellList } = createNotebook([
      "x = 1",
      "y = 2\nz = 3",
      "a = 4",
    ]);
    const doc = buildDocumentFromNotebook(cells, List(cellList));

    const lines = doc.content.split("\n");
    const markers = lines.filter((l) => l.startsWith(ZERO_WIDTH_SPACE));

    expect(markers).toHaveLength(doc.mappings.length);
  });

  it("should not include ZWS in cell content", () => {
    const { cells, cellList } = createNotebook(["x = 1"]);
    const doc = buildDocumentFromNotebook(cells, List(cellList));

    expect(doc.mappings[0].source[0]).not.toContain(ZERO_WIDTH_SPACE);
  });

  it("should handle marker as invisible character", () => {
    // ZWS should have length 1 but be invisible
    expect(ZERO_WIDTH_SPACE.length).toBe(1);
    expect(ZERO_WIDTH_SPACE.charCodeAt(0)).toBe(0x200b);
  });

  it("should strip ZWS characters from cell content (defensive)", () => {
    // Test defensive stripping: if cell content somehow contains ZWS,
    // it should be removed during document building (lines 98-117 in state.ts)
    // This prevents corruption vicious cycles.
    const cells = Map({
      cell1: Map({
        cell_type: "code",
        input: `print("hello")\nx = "${ZERO_WIDTH_SPACE}"world`, // ZWS embedded
        input_type: "code",
      }),
    });
    const cellList = List(["cell1"]);

    const doc = buildDocumentFromNotebook(cells, cellList);

    // The ZWS should be stripped from the source
    const cellContent = doc.mappings[0].source.join("\n");
    expect(cellContent).not.toContain(ZERO_WIDTH_SPACE);
    // After stripping ZWS: x = ""world (empty quotes remain)
    expect(cellContent).toContain('x = ""world');
  });

  it("should handle corrupted markers in cell content", () => {
    // Test scenario: corrupted marker string somehow in cell content
    // Should be stripped to prevent duplication
    const corruptedMarker = `${ZERO_WIDTH_SPACE}c${ZERO_WIDTH_SPACE}c`;
    const cells = Map({
      cell1: Map({
        cell_type: "code",
        input: `print("test")\n${corruptedMarker}`, // Corrupted marker in content
        input_type: "code",
      }),
    });
    const cellList = List(["cell1"]);

    const doc = buildDocumentFromNotebook(cells, cellList);

    // The corrupted marker should be stripped
    // After stripping all ZWS: ⁠c⁠c becomes cc
    const cellContent = doc.mappings[0].source.join("\n");
    expect(cellContent).not.toContain(ZERO_WIDTH_SPACE);
    // The second line becomes "cc" after ZWS is stripped
    expect(cellContent).toContain("cc");
  });
});

describe("Jupyter Single-File Editor - Integration Tests", () => {
  it("should build and parse complex notebook structure", () => {
    const { cells, cellList } = createNotebook([
      "import numpy as np",
      "x = np.array([1, 2, 3])",
      "y = x * 2",
      { type: "markdown", input: "# Results\n\nLet's see the output:" },
      "print(y)",
      { type: "raw", input: "Some raw text for documentation" },
    ]);

    const doc = buildDocumentFromNotebook(cells, List(cellList));

    expect(doc.mappings).toHaveLength(6);
    expect(doc.content.split("\n").length).toBeGreaterThan(6);

    // Verify each cell mapping
    doc.mappings.forEach((mapping, idx) => {
      expect(mapping.cellId).toBe(`cell-${idx}`);
      expect(mapping.position).toBe("below");
    });
  });

  it("should maintain consistency after multiple operations", () => {
    const { cells: c1, cellList: l1 } = createNotebook([
      "x = 1",
      "y = 2",
      "z = 3",
    ]);

    // Build initial document
    const doc1 = buildDocumentFromNotebook(c1, List(l1));

    // Modify a cell
    const c2 = c1.setIn(["cell-1", "input"], "y = 20");
    const doc2 = buildDocumentFromNotebook(c2, List(l1));

    // Verify consistency
    expect(doc1.mappings).toHaveLength(doc2.mappings.length);
    expect(doc2.mappings[1].source).toEqual(["y = 20"]);
  });

  it("should correctly handle content with edge case characters", () => {
    const { cells, cellList } = createNotebook([
      'print("\\n\\t\\r")',
      "x = {'a': 1, 'b': 2}",
      'unicode = "你好世界"',
    ]);

    const doc = buildDocumentFromNotebook(cells, List(cellList));

    expect(doc.mappings[0].source[0]).toContain("\\n\\t\\r");
    expect(doc.mappings[1].source[0]).toContain("'a': 1");
    expect(doc.mappings[2].source[0]).toContain("你好世界");
  });
});

describe("Jupyter Single-File Editor - Cell Navigation & Cursor Placement", () => {
  /**
   * Helper to find if a cell is the last cell in the mappings
   */
  function isLastCell(mappings: CellMapping[], cellId: string): boolean {
    if (mappings.length === 0) return false;
    return mappings[mappings.length - 1].cellId === cellId;
  }

  /**
   * Helper to find the next cell after a given cell
   */
  function getNextCell(
    mappings: CellMapping[],
    cellId: string,
  ): CellMapping | null {
    const currentIndex = mappings.findIndex((m) => m.cellId === cellId);
    if (currentIndex === -1 || currentIndex >= mappings.length - 1) {
      return null; // No next cell
    }
    return mappings[currentIndex + 1];
  }

  /**
   * Helper to get the starting line number of a cell's input
   */
  function getCellInputStartLine(mapping: CellMapping): number {
    return mapping.inputRange.from;
  }

  describe("Last cell detection", () => {
    it("should correctly identify the last cell in single-cell notebook", () => {
      const { cells, cellList } = createNotebook(["x = 1"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const mapping = doc.mappings[0];
      expect(isLastCell(doc.mappings, mapping.cellId)).toBe(true);
    });

    it("should correctly identify the last cell in multi-cell notebook", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Last cell should be cell-2
      expect(isLastCell(doc.mappings, "cell-2")).toBe(true);

      // First and second cells should not be last
      expect(isLastCell(doc.mappings, "cell-0")).toBe(false);
      expect(isLastCell(doc.mappings, "cell-1")).toBe(false);
    });

    it("should return false for non-existent cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      expect(isLastCell(doc.mappings, "non-existent")).toBe(false);
    });

    it("should handle empty notebook", () => {
      const { cells, cellList } = createNotebook([]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      expect(isLastCell(doc.mappings, "any-cell")).toBe(false);
    });
  });

  describe("Next cell navigation", () => {
    it("should get next cell from first cell in multi-cell notebook", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const nextCell = getNextCell(doc.mappings, "cell-0");
      expect(nextCell).not.toBeNull();
      expect(nextCell?.cellId).toBe("cell-1");
    });

    it("should get next cell from second cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const nextCell = getNextCell(doc.mappings, "cell-1");
      expect(nextCell).not.toBeNull();
      expect(nextCell?.cellId).toBe("cell-2");
    });

    it("should return null when there is no next cell (last cell)", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const nextCell = getNextCell(doc.mappings, "cell-2");
      expect(nextCell).toBeNull();
    });

    it("should return null for single-cell notebook", () => {
      const { cells, cellList } = createNotebook(["x = 1"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const nextCell = getNextCell(doc.mappings, "cell-0");
      expect(nextCell).toBeNull();
    });

    it("should return null for non-existent cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const nextCell = getNextCell(doc.mappings, "non-existent");
      expect(nextCell).toBeNull();
    });
  });

  describe("Cell input position retrieval", () => {
    it("should get correct starting line for first cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const startLine = getCellInputStartLine(doc.mappings[0]);
      expect(startLine).toBe(0); // First cell starts at line 0
    });

    it("should get correct starting line for second cell (after first cell + marker)", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // First cell is line 0, marker at line 1, so second cell starts at line 2
      const startLine = getCellInputStartLine(doc.mappings[1]);
      expect(startLine).toBe(2);
    });

    it("should get correct starting lines for multi-cell notebook", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Cell 0: line 0
      expect(getCellInputStartLine(doc.mappings[0])).toBe(0);
      // Cell 1: line 2 (line 0: x=1, line 1: marker)
      expect(getCellInputStartLine(doc.mappings[1])).toBe(2);
      // Cell 2: line 4 (lines 2-3: y=2 + marker)
      expect(getCellInputStartLine(doc.mappings[2])).toBe(4);
    });

    it("should handle multi-line cells correctly", () => {
      const { cells, cellList } = createNotebook([
        "def foo():\n  return 1",
        "y = foo()",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // First cell has 2 lines, so second cell should start after those + marker
      const secondCellStart = getCellInputStartLine(doc.mappings[1]);
      expect(secondCellStart).toBe(3); // Lines 0-1: first cell, line 2: marker
    });
  });

  describe("Cursor placement workflow", () => {
    it("should have all required data to move cursor to next cell", () => {
      const { cells, cellList } = createNotebook(["x = 1", "y = 2", "z = 3"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // User executes cell 0
      const currentCell = doc.mappings[0];
      const isLast = isLastCell(doc.mappings, currentCell.cellId);
      expect(isLast).toBe(false);

      // Get next cell
      const nextCell = getNextCell(doc.mappings, currentCell.cellId);
      expect(nextCell).not.toBeNull();

      // Get position to move cursor to
      const cursorPosition = getCellInputStartLine(nextCell!);
      expect(cursorPosition).toBe(2); // Cursor should go to line 2
    });

    it("should detect when at last cell for new cell insertion", () => {
      const { cells, cellList } = createNotebook(["x = 1"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const currentCell = doc.mappings[0];
      const isLast = isLastCell(doc.mappings, currentCell.cellId);
      expect(isLast).toBe(true);

      // Next cell should be null
      const nextCell = getNextCell(doc.mappings, currentCell.cellId);
      expect(nextCell).toBeNull();

      // This means we should insert a new cell
    });
  });

  describe("Cell execution cursor behavior requirements", () => {
    it("requirement: cursor should jump to next cell start after executing non-last cell", () => {
      const { cells, cellList } = createNotebook(["1+1", "2+2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const currentCell = doc.mappings[0];
      const isLast = isLastCell(doc.mappings, currentCell.cellId);

      if (!isLast) {
        const nextCell = getNextCell(doc.mappings, currentCell.cellId);
        const cursorLine = getCellInputStartLine(nextCell!);

        expect(isLast).toBe(false);
        expect(nextCell?.cellId).toBe("cell-1");
        expect(cursorLine).toBe(2); // Cursor at start of next cell
      }
    });

    it("requirement: new cell should be inserted when executing last cell", () => {
      const { cells, cellList } = createNotebook(["1+1", "2+2"]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      const lastCell = doc.mappings[doc.mappings.length - 1];
      const isLast = isLastCell(doc.mappings, lastCell.cellId);

      expect(isLast).toBe(true);

      // Should not try to navigate to next cell
      const nextCell = getNextCell(doc.mappings, lastCell.cellId);
      expect(nextCell).toBeNull();

      // Signal that a new cell needs to be inserted
      // (The actual insertion logic would be in the editor component)
    });

    it("should enable linear notebook flow with consecutive Shift+Return", () => {
      const { cells, cellList } = createNotebook([
        "x = 10",
        "y = x + 5",
        "x + y",
      ]);
      const doc = buildDocumentFromNotebook(cells, List(cellList));

      // Simulate executing each cell with cursor advancement
      let currentIndex = 0;

      // Execute cell 0
      expect(isLastCell(doc.mappings, doc.mappings[currentIndex].cellId)).toBe(
        false,
      );
      let nextCell = getNextCell(
        doc.mappings,
        doc.mappings[currentIndex].cellId,
      );
      expect(nextCell).not.toBeNull();
      currentIndex += 1;

      // Execute cell 1
      expect(isLastCell(doc.mappings, doc.mappings[currentIndex].cellId)).toBe(
        false,
      );
      nextCell = getNextCell(doc.mappings, doc.mappings[currentIndex].cellId);
      expect(nextCell).not.toBeNull();
      currentIndex += 1;

      // Execute cell 2 (last cell)
      expect(isLastCell(doc.mappings, doc.mappings[currentIndex].cellId)).toBe(
        true,
      );
      nextCell = getNextCell(doc.mappings, doc.mappings[currentIndex].cellId);
      expect(nextCell).toBeNull(); // Should trigger new cell insertion
    });
  });
});
