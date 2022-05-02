/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The slideshow toolbar functionality for cells.
*/

import { React } from "../app-framework";
import { FormControl } from "@cocalc/frontend/antd-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

const TYPES = [
  { title: "-", value: "" },
  { title: "Slide", value: "slide" },
  { title: "Sub-Slide", value: "subslide" },
  { title: "Fragment", value: "fragment" },
  { title: "Skip", value: "skip" },
  { title: "Notes", value: "notes" },
];

const rendered_options = TYPES.map((x) => (
  <option key={x.value} value={x.value}>
    {x.title}
  </option>
));

interface SlideshowProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export const Slideshow: React.FC<SlideshowProps> = (props: SlideshowProps) => {
  const { actions, cell } = props;
  function select(e: any): void {
    actions.set_cell_slide(cell.get("id"), e.target.value);
  }
  return (
    <div style={{ width: "100%" }}>
      <FormControl
        componentClass="select"
        placeholder="select"
        onChange={select}
        value={cell.get("slide", "")}
        style={{ float: "right", width: "200px" }}
      >
        {rendered_options}
      </FormControl>
    </div>
  );
};
