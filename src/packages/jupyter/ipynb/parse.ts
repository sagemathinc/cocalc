/*
This is a very lightweight ipynb parser in pure javascript.

It's used, e.g., in our analogue of nbviewer.
*/

import { IPynbImporter } from "@cocalc/jupyter/ipynb/import-from-ipynb";
import { JUPYTER_MIMETYPES } from "@cocalc/jupyter/util/misc";
import { field_cmp } from "@cocalc/util/misc";

export interface KernelSpec {
  language?: string;
  display_name: string;
  name: string;
}

export interface CoCalcJupyter {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions?: { [field: string]: any };
  metadata?;
  kernelspec: KernelSpec;
}

export default function parse(content: string): CoCalcJupyter {
  const ipynb = JSON.parse(content);
  const importer = new IPynbImporter();
  importer.import({
    ipynb,
    cellOutputHandler: (cell) => {
      let k: number = 0;
      return {
        message: (content) => {
          process(content);
          cell.output[`${k}`] = content;
          k += 1;
        },
      };
    },
  });

  const cells = importer.cells();
  const cellList = sortedCellList(cells);
  const cmOptions = getCMOptions(getMode(ipynb));
  const kernelspec = ipynb.metadata?.kernelspec ?? {
    display_name: "Unknown Kernel",
  };
  return { cells, cellList, cmOptions, kernelspec };
}

export function getMode(ipynb): string {
  return (
    ipynb.metadata?.language_info?.codemirror_mode ??
    ipynb.metadata?.language_info?.name ??
    ipynb.metadata?.kernelspec?.language?.toLowerCase() ??
    "python"
  );
}

export function getCMOptions(
  mode: string | { name: string } | undefined | null,
) {
  if (mode == null) {
    mode = { name: "python" };
  }
  if (typeof mode === "string") {
    mode = { name: mode };
  }
  if (mode.name.includes("python") || mode.name.includes("sage")) {
    mode.name = "python";
  } else if (mode.name === "gp") {
    mode.name = "pari";
  } else if (mode.name === "singular") {
    mode.name = "clike"; // better than nothing
  } else if (mode.name === "ihaskell") {
    mode.name = "haskell";
  }

  return {
    mode,
    showTrailingSpace: true,
    tabSize: 4,
    lineWrapping: true,
    readOnly: true,
  };
}

function process(content): void {
  if (content?.data == null) {
    return;
  }
  for (const type of JUPYTER_MIMETYPES) {
    if (
      content.data[type] != null &&
      (type.split("/")[0] === "image" || type === "application/pdf")
    ) {
      content.data[type] = { value: content.data[type] };
    }
  }
}

function sortedCellList(cells): string[] {
  // Given map from id's to cells, returns an list of ids in correct order,
  // as defined by pos field.
  const v: { id: string; pos: number }[] = [];
  for (const id in cells) {
    v.push({ id, pos: cells[id]?.pos ?? -1 });
  }
  v.sort(field_cmp("pos"));
  const a: string[] = [];
  for (const { id } of v) {
    a.push(id);
  }
  return a;
}
