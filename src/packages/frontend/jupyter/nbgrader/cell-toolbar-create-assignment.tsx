/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
nbgrader functionality: the create assignment toolbar.
*/

import { Button, Select, Space } from "antd";
import { Map } from "immutable";
import { DebounceInput } from "react-debounce-input";
import { Rendered, useRef } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { popup } from "@cocalc/frontend/frame-editors/frame-tree/print";
import { JupyterActions } from "../browser-actions";
import {
  CELL_TYPE_INFO_LIST,
  CELL_TYPE_INFO_MAP,
  set_cell_type,
  state_to_value,
  value_to_state,
  value_to_template_content,
} from "./cell-types";
import type { Metadata } from "./types";

const OPTIONS_CODE = CELL_TYPE_INFO_LIST.filter((x) => !x.markdown_only).map(
  (x) => {
    return {
      ...x,
      label: (
        <>
          {x.icon ? (
            <Icon name={x.icon} style={{ marginRight: "5px" }} />
          ) : undefined}{" "}
          {x.title}
        </>
      ),
    };
  },
);
const OPTIONS_NOTCODE = CELL_TYPE_INFO_LIST.filter((x) => !x.code_only).map(
  (x) => {
    return {
      ...x,
      label: (
        <>
          {x.icon ? (
            <Icon name={x.icon} style={{ marginRight: "5px" }} />
          ) : undefined}{" "}
          {x.title}
        </>
      ),
    };
  },
);

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
    const id = cell.get("id");
    metadata.grade_id = cell.getIn(
      ["metadata", "nbgrader", "grade_id"],
      "",
    ) as string;
    if (!metadata.grade_id) {
      // TODO -- check if default is globally unique...?
      metadata.grade_id = id;
    }
    actions.nbgrader_actions.set_metadata(id, metadata);

    if (cell.get("input", "").trim() == "") {
      const language = actions.store.get_kernel_language();
      const input = value_to_template_content(
        value,
        language,
        cell.get("cell_type", "code"),
      );
      if (input != "") {
        actions.set_cell_input(id, input);
      }
      const set_type = set_cell_type(value);
      if (set_type != null) {
        actions.set_cell_type(id, set_type);
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
    const x = cell.getIn(["metadata", "nbgrader"], Map()) as any;
    if (x == null) return "";
    try {
      const val = state_to_value(x.toJS());
      if (val == null) throw Error();
      return val;
    } catch (err) {
      select(""); // clear all the metadata.
      return "";
    }
  }

  function render_icon(value: string): Rendered {
    const name = CELL_TYPE_INFO_MAP[value]?.icon;
    if (name == null) return;
    return <Icon name={name} style={{ float: "left", padding: "5px" }} />;
  }

  function render_points(): Rendered {
    const points: number | undefined = cell.getIn([
      "metadata",
      "nbgrader",
      "points",
    ]) as any;
    if (points == null) return;
    const do_focus_points = focus_points.current;
    focus_points.current = false;
    return (
      <>
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
      </>
    );
  }

  function set_grade_id(grade_id: string): void {
    // DO NOT allow whitespace (see https://github.com/sagemathinc/cocalc/issues/4743):
    grade_id = grade_id.replace(/\s+/g, "");
    actions.nbgrader_actions.set_metadata(cell.get("id"), { grade_id });
    // Check globally unique, and if not change it until it is.
    // Not doing this can be very painful, e.g., nbgrader later
    // doesn't work properly.  We can't just do this check here,
    // since copy/paste can also create multiple cells with the same id.
    actions.nbgrader_actions.ensure_grade_ids_are_unique();
  }

  function render_id(): Rendered {
    const grade_id: string | undefined = cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id",
    ]) as any;
    if (grade_id == null) return;
    return (
      <>
        <span style={{ marginLeft: "15px", fontWeight: 400 }}>ID:</span>
        <DebounceInput
          debounceTimeout={2000}
          spellCheck={false}
          element="input"
          className="form-control"
          value={grade_id}
          onChange={(e) => set_grade_id((e.target as any).value)}
          style={{
            width: `${grade_id.length <= 6 ? 72 : 180}px`,
            marginLeft: "10px",
            paddingLeft: "5px",
            color: "#666",
            fontSize: "14px",
            height: "32px",
          }}
        />
      </>
    );
  }

  function render_dropdown(): Rendered {
    const options =
      cell.get("cell_type", "code") == "code" ? OPTIONS_CODE : OPTIONS_NOTCODE;
    return (
      <Select
        options={options}
        onChange={select}
        value={get_value()}
        style={{ marginLeft: "15px", width: "225px" }}
      />
    );
  }

  function click_help(): void {
    const value = get_value();
    const info = CELL_TYPE_INFO_MAP[value];
    if (info == null || info.link == null) return;
    popup(info.link, 750);
  }

  function render_help(): Rendered {
    const value = get_value();
    const info = CELL_TYPE_INFO_MAP[value];
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
      <Space style={{ float: "right" }}>
        {render_points()}
        {render_id()}
        {render_dropdown()}
        {render_help()}
      </Space>
    </div>
  );
};
