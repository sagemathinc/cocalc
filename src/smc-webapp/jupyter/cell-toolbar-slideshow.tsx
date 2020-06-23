/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The slideshow toolbar functionality for cells.
*/

import { React, Component } from "../app-framework";

import { FormControl } from "react-bootstrap";
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

export class Slideshow extends Component<SlideshowProps> {
  select = (e: any) =>
    this.props.actions.set_cell_slide(
      this.props.cell.get("id"),
      e.target.value
    );
  render() {
    return (
      <div style={{ width: "100%" }}>
        <FormControl
          componentClass="select"
          placeholder="select"
          onChange={this.select}
          value={this.props.cell.get("slide", "")}
          style={{ float: "right", width: "200px" }}
        >
          {rendered_options}
        </FormControl>
      </div>
    );
  }
}
