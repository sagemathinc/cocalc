/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

import { List, Map } from "immutable";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { buildDocumentFromNotebook } from "../state";
import { applyCellMergeEffect } from "../merge-handler";
import { cellMergeEffect, createCellMergingFilter } from "../filters";

interface CellConfig {
  type: "code" | "markdown";
  input: string;
  output?: string | null;
  execCount?: number | null;
}

function createNotebook(cellsConfig: CellConfig[]) {
  let cells = Map<string, Map<string, any>>();
  const cellList: string[] = [];

  cellsConfig.forEach((config, index) => {
    const cellId = `cell-${index}`;
    cellList.push(cellId);
    const outputs =
      config.output == null
        ? null
        : Map({
            "0": Map({
              text: config.output,
            }),
          });

    cells = cells.set(
      cellId,
      Map({
        type: "cell",
        cell_type: config.type,
        input: config.input,
        output: outputs,
        exec_count: config.execCount ?? (config.output != null ? index + 1 : null),
      }),
    );
  });

  return { cells, cellList };
}

class MockActions {
  store: Map<string, any>;

  constructor(
    cells: Map<string, Map<string, any>>,
    cellList: List<string>,
  ) {
    this.store = Map({
      cells,
      cell_list: cellList,
    });
  }

  clear_outputs = (ids: string[]): void => {
    this.store = this.store.update("cells", (cells: Map<string, any>) =>
      cells.withMutations((mutable) => {
        for (const id of ids) {
          if (mutable.has(id)) {
            mutable.setIn([id, "output"], null);
            mutable.setIn([id, "exec_count"], null);
          }
        }
      }),
    );
  };

  set_cell_input = (id: string, input: string): void => {
    this.store = this.store.setIn(["cells", id, "input"], input);
  };

  set_cell_type = (id: string, type: "code" | "markdown"): void => {
    this.store = this.store.setIn(["cells", id, "cell_type"], type);
  };

  delete_cells = (ids: string[]): void => {
    this.store = this.store
      .update("cells", (cells: Map<string, any>) =>
        cells.withMutations((mutable) => {
          for (const id of ids) {
            mutable.delete(id);
          }
        }),
      )
      .update("cell_list", (list: List<string>) =>
        list.filter((cellId) => !ids.includes(cellId)) as List<string>,
      );
  };
}

function getMergeEffect(
  docData: ReturnType<typeof buildDocumentFromNotebook>,
  cellIndex: number,
  direction: "end" | "start",
) {
  const mappingsRef = { current: docData.mappings };
  let effectValue: any = null;

  const view = new EditorView({
    state: EditorState.create({
      doc: docData.content,
      extensions: [
        createCellMergingFilter(mappingsRef, {} as any),
        EditorView.updateListener.of((update) => {
          update.transactions.forEach((tr) => {
            tr.effects.forEach((effect) => {
              if (effect.is(cellMergeEffect)) {
                effectValue = effect.value;
              }
            });
          });
        }),
      ],
    }),
  });

  const mapping = docData.mappings[cellIndex];
  const doc = view.state.doc;

  if (direction === "end") {
    const lastLineNumber = Math.max(1, mapping.inputRange.to);
    const lastLine = doc.line(lastLineNumber);
    view.dispatch({
      changes: { from: lastLine.to, to: lastLine.to + 1, insert: "" },
      userEvent: "delete",
    });
  } else {
    const firstLineNumber = Math.max(1, mapping.inputRange.from + 1);
    const firstLine = doc.line(firstLineNumber);
    const deletionStart = Math.max(firstLine.from - 1, 0);
    view.dispatch({
      changes: { from: deletionStart, to: deletionStart + 1, insert: "" },
      userEvent: "delete",
    });
  }

  view.destroy();
  if (effectValue == null) {
    throw new Error("merge effect not generated");
  }
  return effectValue;
}

function getCell(
  actions: MockActions,
  id: string,
): Map<string, any> | undefined {
  const cell = actions.store.getIn(["cells", id]);
  return cell as Map<string, any> | undefined;
}

function requireCell(actions: MockActions, id: string): Map<string, any> {
  const cell = getCell(actions, id);
  if (!cell) {
    throw new Error(`Expected cell '${id}' to exist`);
  }
  return cell;
}

describe("Full merge workflow", () => {
  it("merging first two cells clears outputs and preserves remaining cell", () => {
    const { cells, cellList } = createNotebook([
      { type: "code", input: "1", output: "1" },
      { type: "code", input: "2", output: "2" },
      { type: "code", input: "3", output: "3" },
    ]);
    const docData = buildDocumentFromNotebook(cells, List(cellList));
    const mergeEffect = getMergeEffect(docData, 0, "end");

    const actions = new MockActions(cells, List(cellList));
    applyCellMergeEffect(actions as any, mergeEffect);

    const store = actions.store;
    const updatedCells = store.get("cells");
    const updatedList = store.get("cell_list");

    expect(updatedList.toArray()).toEqual(["cell-1", "cell-2"]);
    expect(updatedCells.has("cell-0")).toBe(false);
    expect(updatedCells.getIn(["cell-1", "input"])).toBe("1\n2");
    expect(updatedCells.getIn(["cell-1", "output"])).toBeNull();
    expect(updatedCells.getIn(["cell-1", "exec_count"])).toBeNull();
    expect(updatedCells.getIn(["cell-2", "input"])).toBe("3");
    expect(updatedCells.getIn(["cell-2", "output", "0", "text"])).toBe("3");
  });

  it("merges multi-line code cells forward", () => {
    const multiLine = [
      { type: "code", input: "x = 1+1\nx += 1\nprint(x)", output: "3" },
      { type: "code", input: "print(4)", output: "4" },
      { type: "code", input: "print(5)", output: "5" },
    ] satisfies CellConfig[];
    const { cells, cellList } = createNotebook(multiLine);
    const docData = buildDocumentFromNotebook(cells, List(cellList));
    const mergeEffect = getMergeEffect(docData, 0, "end");

    const actions = new MockActions(cells, List(cellList));
    applyCellMergeEffect(actions as any, mergeEffect);

    expect(actions.store.get("cell_list").toArray()).toEqual([
      "cell-1",
      "cell-2",
    ]);

    const merged = requireCell(actions, "cell-1");
    expect(merged.get("input")).toBe(
      "x = 1+1\nx += 1\nprint(x)\nprint(4)",
    );
    expect(merged.get("output")).toBeNull();
    expect(merged.get("exec_count")).toBeNull();

    const tail = requireCell(actions, "cell-2");
    expect(tail.get("input")).toBe("print(5)");
    expect(tail.getIn(["output", "0", "text"])).toBe("5");
  });

  it("backspace merges multi-line code into previous code cell", () => {
    const configs: CellConfig[] = [
      { type: "code", input: "print('top')", output: "top" },
      {
        type: "code",
        input: "y = 2\ny += 1\nprint(y)",
        output: "3",
      },
      { type: "code", input: "print('tail')", output: "tail" },
    ];
    const { cells, cellList } = createNotebook(configs);
    const docData = buildDocumentFromNotebook(cells, List(cellList));
    const mergeEffect = getMergeEffect(docData, 1, "start");

    const actions = new MockActions(cells, List(cellList));
    applyCellMergeEffect(actions as any, mergeEffect);

    expect(actions.store.get("cell_list").toArray()).toEqual([
      "cell-0",
      "cell-2",
    ]);

    const merged = requireCell(actions, "cell-0");
    expect(merged.get("input")).toBe(
      "print('top')\ny = 2\ny += 1\nprint(y)",
    );
    expect(merged.get("output")).toBeNull();

    const tail = requireCell(actions, "cell-2");
    expect(tail.getIn(["output", "0", "text"])).toBe("tail");
  });

  it("backspace merges code into markdown cell and preserves markdown type", () => {
    const configs: CellConfig[] = [
      { type: "markdown", input: "# Heading", output: null },
      { type: "code", input: "print('x')", output: "x" },
      { type: "code", input: "print('y')", output: "y" },
    ];
    const { cells, cellList } = createNotebook(configs);
    const docData = buildDocumentFromNotebook(cells, List(cellList));
    const mergeEffect = getMergeEffect(docData, 1, "start");

    const actions = new MockActions(cells, List(cellList));
    applyCellMergeEffect(actions as any, mergeEffect);

    expect(actions.store.get("cell_list").toArray()).toEqual([
      "cell-0",
      "cell-2",
    ]);

    const mergedMarkdown = requireCell(actions, "cell-0");
    expect(mergedMarkdown.get("cell_type")).toBe("markdown");
    expect(mergedMarkdown.get("input")).toBe("# Heading\nprint('x')");
    expect(mergedMarkdown.get("output")).toBeNull();

    const remainingCode = requireCell(actions, "cell-2");
    expect(remainingCode.get("cell_type")).toBe("code");
    expect(remainingCode.getIn(["output", "0", "text"])).toBe("y");
  });

  it("merging middle cells preserves surrounding order", () => {
    const configs: CellConfig[] = [
      { type: "code", input: "a", output: "a" },
      { type: "code", input: "b", output: "b" },
      { type: "code", input: "c", output: "c" },
      { type: "code", input: "d", output: "d" },
      { type: "code", input: "e", output: "e" },
    ];
    const { cells, cellList } = createNotebook(configs);
    const docData = buildDocumentFromNotebook(cells, List(cellList));
    const mergeEffect = getMergeEffect(docData, 2, "end"); // merge cell-2 into cell-3

    const actions = new MockActions(cells, List(cellList));
    applyCellMergeEffect(actions as any, mergeEffect);

    expect(actions.store.get("cell_list").toArray()).toEqual([
      "cell-0",
      "cell-1",
      "cell-3",
      "cell-4",
    ]);
    expect(requireCell(actions, "cell-3").get("input")).toBe("c\nd");
    expect(requireCell(actions, "cell-0").get("input")).toBe("a");
    expect(requireCell(actions, "cell-4").get("input")).toBe("e");
  });
});
