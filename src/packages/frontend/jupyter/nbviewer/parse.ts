import { IPynbImporter } from "../import-from-ipynb";
import { JUPYTER_MIMETYPES } from "../util";
import { cm_options as getCMOptions } from "../cm_options";
import { field_cmp } from "@cocalc/util/misc";

interface Parsed {
  cellList: string[];
  cells: { [id: string]: object };
  cmOptions: { [field: string]: any };
}

export default function parse(content: string): Parsed {
  const ipynb = JSON.parse(content);
  const importer = new IPynbImporter();
  importer.import({
    ipynb,
    output_handler: (cell) => {
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
  const cmOptions = {
    options: getCMOptions(getMode(ipynb)),
  };
  return { cells, cellList, cmOptions };
}

function getMode(ipynb): string {
  return (
    ipynb.metadata?.language_info?.codemirror_mode ??
    ipynb.metadata?.language_info?.name ??
    ipynb.metadata.kernelspec.language.toLowerCase() ??
    "python"
  );
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
