/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The slideshow toolbar functionality for cells.
*/
import { Select } from "antd";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

const TYPES = [
  { title: "-", value: "" },
  { title: "Slide", value: "slide" },
  { title: "Sub-Slide", value: "subslide" },
  { title: "Fragment", value: "fragment" },
  { title: "Skip", value: "skip" },
  { title: "Notes", value: "notes" },
] as const;

interface SlideshowProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export function Slideshow({ actions, cell }: SlideshowProps) {
  return (
    <div style={{ width: "100%" }}>
      <Select
        onChange={(value) => {
          actions.set_cell_slide(cell.get("id"), value);
        }}
        value={cell.get("slide", "")}
        style={{ float: "right", width: "200px" }}
        options={TYPES.map((x) => ({
          label: x.title,
          value: x.value,
        }))}
      />
    </div>
  );
}
