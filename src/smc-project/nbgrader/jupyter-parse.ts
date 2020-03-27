import { readFile } from "fs";
import { callback } from "awaiting";

// Strip output and attachments from all cells.
export async function jupyter_strip_notebook(
  ipynb_path: string
): Promise<string> {
  // Load the file
  const contents = (await callback(readFile, ipynb_path)).toString();

  // Parse as JSON
  const obj: any = JSON.parse(contents);

  // Strip output from cells
  if (obj != null && obj.cells != null) {
    for (const cell of obj.cells) {
      if (cell.outputs != null) {
        // Just deleting this field would result in an invalid ipynb file.  I couldn't
        // find a statement that this required in the nbformat spec, but testing
        // the classic server implies that it is.
        cell.outputs = [];
      }
      if (cell.attachments != null) {
        delete cell.attachments;
      }
    }
  }

  // Return version converted back to a string.
  return JSON.stringify(obj);
}
