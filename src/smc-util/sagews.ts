//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
Some functions for working with Sage worksheets (sagews files) --
*/

//---------------------------------------------------------------------------------------------------------
// Support for using synchronized docs to represent Sage Worksheets (i.e., live compute documents)
//---------------------------------------------------------------------------------------------------------

// WARNING: in Codemirror, to avoid issues with parsing I also set the output marker to be a comment character
// by modifying the python mode as follows:     if (ch == "#"  || ch == "\uFE21") {

export const MARKERS = {
  cell: "\uFE20",
  output: "\uFE21"
};

export const FLAGS = {
  execute: "x", // request that cell be executed
  waiting: "w", // request to execute received, but still not running (because of another cell running)
  running: "r", // cell currently running
  interrupt: "c", // request execution of cell be interrupted
  this_session: "s", // if set, cell was executed during the current sage session.
  hide_input: "i", // hide input part of cell
  hide_output: "o" // hide output part of cell
};

export const ACTION_FLAGS = [
  FLAGS.execute,
  FLAGS.running,
  FLAGS.waiting,
  FLAGS.interrupt
];

export const ACTION_SESSION_FLAGS = [
  FLAGS.execute,
  FLAGS.running,
  FLAGS.waiting,
  FLAGS.interrupt,
  FLAGS.this_session
];

/*
Return a list of the uuids of files that are displayed in the given document,
where doc is the string representation of a worksheet.
At present, this function finds all output messages of the form
  {"file":{"uuid":"806f4f54-96c8-47f0-9af3-74b5d48d0a70",...}}
but it could do more at some point in the future.
*/

export function uuids_of_linked_files(doc): string[] {
  const uuids: string[] = [];
  let i = 0;
  while (true) {
    i = doc.indexOf(MARKERS.output, i);
    if (i === -1) {
      return uuids;
    }
    let j = doc.indexOf("\n", i);
    if (j === -1) {
      j = doc.length;
    }
    const line = doc.slice(i, j);
    for (let m of line.split(MARKERS.output).slice(1)) {
      // Only bother to run the possibly slow JSON.parse on file messages; since
      // this function would block the global hub server, this is important.
      if (m.slice(0, 8) === '{"file":') {
        const mesg = JSON.parse(m);
        if (mesg.file != null) {
          const uuid = mesg.file.uuid;
          if (uuid != null) {
            uuids.push(uuid);
          }
        }
      }
    }
    i = j;
  }
}

export class SageWS {
  public content: string;

  constructor(content: string) {
    this.content = content;
  }

  public find_cell_meta(
    id,
    start?
  ): undefined | { start: number; end: number } {
    const i = this.content.indexOf(MARKERS.cell + id, start);
    const j = this.content.indexOf(MARKERS.cell, i + 1);
    if (j === -1) {
      return undefined;
    }
    return { start: i, end: j };
  }

  public get_cell_flagstring(id): undefined | string {
    const pos = this.find_cell_meta(id);
    if (pos != null) {
      return this.content.slice(pos.start + 37, pos.end);
    }
  }

  public set_cell_flagstring(id, flags): void {
    const pos = this.find_cell_meta(id);
    if (pos != null) {
      this.content =
        this.content.slice(0, pos.start + 37) +
        flags +
        this.content.slice(pos.end);
    }
  }

  public remove_cell_flag(id, flag): void {
    const s = this.get_cell_flagstring(id);
    if (s != null && s.includes(flag)) {
      this.set_cell_flagstring(
        id,
        s.replace(new RegExp(flag, "g"), "")
      );
    }
  }

  public set_cell_flag(id, flag): void {
    const s = this.get_cell_flagstring(id);
    if (s != null && !s.includes(flag)) {
      this.set_cell_flagstring(id, s + flag);
    }
  }
}

export function sagews(content: string): SageWS {
  return new SageWS(content);
}
