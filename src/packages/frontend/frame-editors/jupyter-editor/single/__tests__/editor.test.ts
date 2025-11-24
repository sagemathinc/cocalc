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
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { buildDocumentFromNotebook, type CellMapping } from "../state";
import { cellMergeEffect, createCellMergingFilter } from "../filters";
import { applyCellMergeEffect } from "../merge-handler";
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

    it("should capture outputs and execution state", () => {
      const { cells, cellList } = createNotebook(["print('x')"]);
      const outputData = Map({
        "0": Map({
          data: Map({ "text/plain": "result" }),
          text: "result",
        }),
      });
      const enrichedCells = cells
        .setIn(["cell-0", "output"], outputData)
        .setIn(["cell-0", "state"], "busy");

      const result = buildDocumentFromNotebook(enrichedCells, List(cellList));

      expect(result.mappings[0].outputs).toEqual([
        {
          data: { "text/plain": "result" },
          text: "result",
        },
      ]);
      expect(result.mappings[0].state).toBe("busy");
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

describe("Jupyter Single-File Editor - Cell Merging", () => {
  function createMergingHarness(
    cellConfigs: Array<string | { type: string; input: string }>,
  ) {
    const { cells, cellList } = createNotebook(cellConfigs);
    const doc = buildDocumentFromNotebook(cells, List(cellList));
    const mappingsRef = { current: doc.mappings };
    const captured: Transaction[] = [];

    const view = new EditorView({
      state: EditorState.create({
        doc: doc.content,
        extensions: [
          createCellMergingFilter(mappingsRef, {} as any),
          EditorView.updateListener.of((update) => {
            if (update.transactions.length > 0) {
              captured.push(...update.transactions);
            }
          }),
        ],
      }),
    });

    return {
      view,
      getEffects() {
        return captured.flatMap((tr) =>
          tr.effects.filter((effect) => effect.is(cellMergeEffect)),
        );
      },
    };
  }

  it("should dispatch merge effect when deleting boundary before marker", () => {
    const harness = createMergingHarness(["x = 1", "y = 2"]);
    const firstLine = harness.view.state.doc.line(1);
    const deletionStart = firstLine.to; // delete newline after first cell
    harness.view.dispatch({
      changes: { from: deletionStart, to: deletionStart + 1, insert: "" },
      userEvent: "delete",
    });

    const effects = harness.getEffects();
    expect(effects).toHaveLength(1);
    expect(effects[0].value).toMatchObject({
      sourceCellId: "cell-0",
      targetCellId: "cell-1",
      isAtEnd: true,
    });
    harness.view.destroy();
  });

  it("should dispatch merge effect when deleting at start of cell", () => {
    const harness = createMergingHarness(["x = 1", "y = 2"]);
    const secondLine = harness.view.state.doc.line(3);
    const deletionStart = Math.max(secondLine.from - 1, 0); // delete newline before second cell
    harness.view.dispatch({
      changes: {
        from: deletionStart,
        to: deletionStart + 1,
        insert: "",
      },
      userEvent: "delete",
    });

    const effects = harness.getEffects();
    expect(effects).toHaveLength(1);
    expect(effects[0].value).toMatchObject({
      sourceCellId: "cell-1",
      targetCellId: "cell-0",
      isAtEnd: false,
    });
    harness.view.destroy();
  });

  it("should ignore deletions that stay within a cell", () => {
    const harness = createMergingHarness(["x = 123", "y = 2"]);
    harness.view.dispatch({
      changes: { from: 2, to: 3, insert: "" },
      userEvent: "delete",
    });

    expect(harness.getEffects()).toHaveLength(0);
    harness.view.destroy();
  });
});

describe("applyCellMergeEffect helper", () => {
  function createMockActions() {
    const cells = Map({
      "cell-0": Map({ input: "1" }),
      "cell-1": Map({ input: "2" }),
      "cell-2": Map({ input: "3" }),
    });
    const store = Map({ cells });
    const clear_outputs = jest.fn();
    const set_cell_input = jest.fn();
    const delete_cells = jest.fn();
    const actions = {
      store,
      clear_outputs,
      set_cell_input,
      delete_cells,
    } as any;
    return { actions, clear_outputs, set_cell_input, delete_cells };
  }

  it("merges forward deletion and clears outputs", () => {
    const { actions, clear_outputs, set_cell_input, delete_cells } =
      createMockActions();

    applyCellMergeEffect(actions, {
      sourceCellId: "cell-0",
      targetCellId: "cell-1",
      sourceContent: "1",
      isAtEnd: true,
    });

    expect(clear_outputs).toHaveBeenCalledWith(["cell-1"]);
    expect(set_cell_input).toHaveBeenCalledWith("cell-1", "1\n2", true);
    expect(delete_cells).toHaveBeenCalledWith(["cell-0"]);
  });

  it("merges backward deletion and clears outputs", () => {
    const { actions, clear_outputs, set_cell_input, delete_cells } =
      createMockActions();

    applyCellMergeEffect(actions, {
      sourceCellId: "cell-2",
      targetCellId: "cell-1",
      sourceContent: "3",
      isAtEnd: false,
    });

    expect(clear_outputs).toHaveBeenCalledWith(["cell-1"]);
    expect(set_cell_input).toHaveBeenCalledWith("cell-1", "2\n3", true);
    expect(delete_cells).toHaveBeenCalledWith(["cell-2"]);
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
