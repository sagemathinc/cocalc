/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
nbgrader functionality: the create assignment toolbar.
*/

import { DebounceInput } from "react-debounce-input";
import { Button, FormControl, Form } from "../../antd-bootstrap";
import { Map } from "immutable";
import { React, Rendered, useRef } from "../../app-framework";
import { Icon } from "../../r_misc/icon";
import { JupyterActions } from "../browser-actions";
import { Metadata } from "./types";
import { popup } from "../../frame-editors/frame-tree/print";
import {
  CELLTYPE_INFO_LIST,
  CELLTYPE_INFO_MAP,
  value_to_state,
  state_to_value,
  value_to_template_content,
  set_cell_type
} from "./cell-types";

const OPTIONS_CODE: Rendered[] = [];
const OPTIONS_NOTCODE: Rendered[] = [];

for (const x of CELLTYPE_INFO_LIST) {
  const option = (
    <option key={x.value} value={x.value}>
      {x.title}
    </option>
  );
  if (!x.markdown_only) {
    OPTIONS_CODE.push(option);
  }
  if (!x.code_only) {
    OPTIONS_NOTCODE.push(option);
  }
}

interface Props {
  actions: JupyterActions;
  cell: Map<string, any>;
}

export const CreateAssignmentToolbar: React.FC<Props> = ({ actions, cell }) => {
  const focus_points = useRef<boolean>(false);

  function select(value: string): void {
    if (value == "") {
      // clearing state
      actions.nbgrader_actions.set_metadata(cell.get("id"));
      return;
    }
    const metadata: Metadata = value_to_state(value);
    const id = cell.get("id")
    metadata.grade_id = cell.getIn(["metadata", "nbgrader", "grade_id"], "");
    if (!metadata.grade_id) {
      // TODO -- check if default is globally unique...?
      metadata.grade_id = id
    }
    actions.nbgrader_actions.set_metadata(id, metadata);

    if (cell.get("input", "").trim() == "") {
      const language: string = actions.store.get_kernel_language();
      const input = value_to_template_content(
        value,
        language,
        cell.get("cell_type", "code")
      );
      if (input != "") {
        actions.set_cell_input(id, input);
      }
      const set_type = set_cell_type(value)
      if (set_type != null) {
        actions.set_cell_type(id, set_type)
      }
    }
  }

  function set_points(points: number): void {
    focus_points.current = true;
    if (!Number.isFinite(points) || points < 0) {
      points = 0;
    }
    actions.nbgrader_actions.set_metadata(cell.get("id"), { points });
  }

  function get_value(): string {
    const x = cell.getIn(["metadata", "nbgrader"], Map());
    if (x == null) return "";
    try {
      return state_to_value(x.toJS());
    } catch (err) {
      select(""); // clear all the metadata.
      return "";
    }
  }

  function render_icon(value: string): Rendered {
    const name = CELLTYPE_INFO_MAP[value]?.icon;
    if (name == null) return;
    return <Icon name={name} style={{ float: "left", padding: "5px" }} />;
  }

  function render_points(): Rendered {
    const points: number | undefined = cell.getIn([
      "metadata",
      "nbgrader",
      "points",
    ]);
    if (points == null) return;
    const do_focus_points = focus_points.current;
    focus_points.current = false;
    return (
      <span>
        <span style={{ fontWeight: 400 }}>Points:</span>
        <DebounceInput
          element={"input"}
          className="form-control"
          debounceTimeout={2000}
          value={points ?? 0}
          autoFocus={do_focus_points}
          onChange={(e) => set_points(parseFloat(`${(e as any).target.value}`))}
          style={{
            color: "#666",
            width: "10ex",
            marginLeft: "5px",
            fontSize: "14px",
          }}
        />
      </span>
    );
  }

  function set_grade_id(grade_id: string): void {
    // TODO: check globally unique...?
    // DO NOT allow whitespace (see https://github.com/sagemathinc/cocalc/issues/4743):
    grade_id = grade_id.replace(/\s+/g, "");
    actions.nbgrader_actions.set_metadata(cell.get("id"), { grade_id });
  }

  function render_id(): Rendered {
    const grade_id: string | undefined = cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id",
    ]);
    if (grade_id == null) return;
    return (
      <span>
        <span style={{ marginLeft: "15px", fontWeight: 400 }}>ID:</span>
        <DebounceInput
          debounceTimeout={2000}
          spellCheck={false}
          element="input"
          className="form-control"
          value={grade_id}
          onChange={(e) => set_grade_id((e.target as any).value)}
          style={{
            width: `${grade_id.length <= 6 ? 64 : 180}px`,
            marginLeft: "10px",
            paddingLeft: "5px",
            color: "#666",
            fontSize: "14px",
            height: "32px",
          }}
        />
      </span>
    );
  }

  function render_dropdown(): Rendered {
    const options =
      cell.get("cell_type", "code") == "code" ? OPTIONS_CODE : OPTIONS_NOTCODE;
    return (
      <FormControl
        componentClass="select"
        placeholder="select"
        onChange={(e) => select((e as any).target.value)}
        value={get_value()}
        style={{ marginLeft: "15px" }}
      >
        {options}
      </FormControl>
    );
  }

  function click_help(): void {
    const value = get_value();
    const info = CELLTYPE_INFO_MAP[value];
    if (info == null || info.link == null) return;
    popup(info.link, 750);
  }

  function render_help(): Rendered {
    const value = get_value();
    const info = CELLTYPE_INFO_MAP[value];
    if (info == null) return;
    return (
      <Button
        onClick={() => click_help()}
        style={{ marginLeft: "15px" }}
        title={info.hover}
      >
        <Icon name="question-circle" />
      </Button>
    );
  }

  const value = get_value();
  let background: string;
  let color: string;
  if (value == "" || value == "readonly") {
    color = "#000";
    background = "#eee";
  } else {
    color = "#fff";
    background = "#337ab7";
  }
  return (
    <div style={{ width: "100%", background, color, padding: "3px" }}>
      {render_icon(value)}
      <Form inline style={{ float: "right" }}>
        {render_points()}
        {render_id()}
        {render_dropdown()}
        {render_help()}
      </Form>
    </div>
  );
};
