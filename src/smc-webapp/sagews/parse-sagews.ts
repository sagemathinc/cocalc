/*
Take a sagews file and produce a structured object representation of it.

Why?

- This is used for our public share server, to have sane input to a React-based renderer.
- This will be used for a syncdb based version of sage worksheets, someday.

*/

import { MARKERS } from "smc-util/sagews";

// Input: a string that is the contents of a .sagews file
// Output: a list of objects
//   [{type:'cell', pos:0, id:'...', flags:'...', input:'...', output:{0:mesg, 1:mesg, ...}}]

export type OutputMessage = any;
export type OutputMessages = { [n: number]: OutputMessage };

type CellTypes = "cell";

export interface Cell {
  type: CellTypes;
  pos: number;
  id: string;
  flags?: string;
  input?: string;
  output?: OutputMessages;
}

export function parse_sagews(sagews: string): Cell[] {
  const obj: Cell[] = [];
  let pos: number = 0;
  let i: number = 0;
  while (true) {
    const meta_start: number = sagews.indexOf(MARKERS.cell, i);
    if (meta_start === -1) {
      break;
    }
    const meta_end: number = sagews.indexOf(MARKERS.cell, meta_start + 1);
    if (meta_end === -1) {
      break;
    }
    const id: string = sagews.slice(meta_start + 1, meta_start + 1 + 36);
    const flags: string = sagews.slice(meta_start + 1 + 36, meta_end);
    let output_start: number = sagews.indexOf(MARKERS.output, meta_end + 2);
    let output_end: number;
    if (output_start === -1) {
      output_start = sagews.length;
      output_end = sagews.length;
    } else {
      const n: number = sagews.indexOf(MARKERS.cell, output_start + 1);
      if (n === -1) {
        output_end = sagews.length;
      } else {
        output_end = n - 1;
      }
    }
    const input: string = sagews.slice(meta_end + 2, output_start - 1);
    let n: number = 0;
    const output: OutputMessages = {};
    for (let s of sagews
      .slice(output_start + 38, output_end)
      .split(MARKERS.output)) {
      if (!s) {
        continue;
      }
      try {
        const mesg: OutputMessage = JSON.parse(s);
        output[`${n}`] = mesg;
        n += 1;
      } catch (err) {
        console.warn(`exception parsing '${s}'; ignoring -- ${err}`);
      }
    }
    const cell: Cell = {
      type: "cell",
      pos,
      id
    };
    if (flags) {
      cell.flags = flags;
    }
    if (n > 0) {
      cell.output = output;
    }
    if (input) {
      cell.input = input;
    }
    obj.push(cell);
    pos += 1;
    i = output_end + 1;
  }

  if (pos === 0 && sagews.trim().length > 0) {
    // special case -- no defined cells, e.g., just code that hasn't been run
    obj.push({
      type: "cell",
      pos: 0,
      id: "",
      input: sagews
    });
  }

  return obj;
}
