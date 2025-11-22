import { DEFAULT_IPYNB } from "@cocalc/jupyter/ipynb/import-from-ipynb";
import { cloneDeep } from "lodash";
import { MARKERS, inputIsHidden, outputIsHidden } from "./flags";

export default function sagewsToIpynb(content: string) {
  const ipynb = cloneDeep(DEFAULT_IPYNB) as any;
  ipynb.metadata = {
    kernelspec: {
      name: "sage",
      display_name: "SageMath",
      language: "sagemath",
    },
  };
  const cells: Cell[] = content
    .split(`\n${MARKERS.cell}`)
    .map((raw) => parseCell(raw))
    .filter((x) => x != null);
  ipynb.cells = [];
  for (const cell of cells) {
    ipynb.cells.push(toIpynbCell(cell));
  }
  return ipynb;
}

interface Cell {
  id: string;
  codes: string;
  input: string;
}

function toIpynbCell(cell: Cell) {
  let ip: any;
  if (cell.input.startsWith("%md")) {
    ip = {
      source: cell.input
        .slice(3)
        .trim()
        .split("\n")
        .map((x) => x + "\n") as string[],
      cell_type: "markdown",
      execution_count: null,
      metadata: {},
    };
  } else {
    ip = {
      outputs: [],
      source: cell.input.split("\n").map((x) => x + "\n") as string[],
      cell_type: "code",
      execution_count: null,
      metadata: {},
    };
  }
  // get rid of trailing \n
  ip.source[ip.source.length - 1] = ip.source[ip.source.length - 1].trimRight();

  if (inputIsHidden(cell.codes) || outputIsHidden(cell.codes)) {
    ip.metadata.jupyter = {};
    if (inputIsHidden(cell.codes)) {
      ip.metadata.jupyter.source_hidden = true;
    }
    if (outputIsHidden(cell.codes)) {
      ip.metadata.jupyter.outputs_hidden = true;
    }
  }
  return ip;
}

function parseCell(raw: string): Cell | null {
  const v = raw.split("\n" + MARKERS.output);
  if (v.length == 0) {
    return null;
  }
  const w = v[0].trim().split(MARKERS.cell + "\n");
  const input = w[1]?.trim() ?? "";
  const n = w[0].slice(1);
  const id = n.slice(0, 36);
  const codes = n.slice(36);
  return { input, id, codes };
}

export function sagewsToMarkdown(raw: string): string {
  const ipynb = sagewsToIpynb(raw);
  let s = "";
  for (const cell of ipynb.cells) {
    const input = cell.source.join("");
    if (!input.trim()) {
      continue;
    }
    if (cell.cell_type != "code") {
      s += "\n" + cell.source.join("") + "\n";
    } else {
      s += "\n```sage\n" + cell.source.join("") + "\n```\n\n\n";
    }
  }
  return s;
}
