/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Edit description of a single task
*/

/*
import { React, CSS } from "../../app-framework";
import { TaskActions } from "./actions";

const STYLE: CSS = {
  width: "100%",
  overflow: "auto",
  marginBottom: "1ex",
  minheight: "2em",
  padding: "5px",
  border: "1px solid #ccc",
  borderRadius: "3px",
  background: "#fff",
} as const;

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  is_current: boolean;
  font_size: number; // used only to cause refresh
}

export const DescriptionEditor: React.FC<Props> = React.memo(
  ({ actions, task_id, desc, is_current, font_size }) => {
    const editor_setting;
    return (
      <div style={STYLE}>
        <textarea value={desc} />
      </div>
    );
  }
);*/

export const { DescriptionEditor } = require("../../tasks/desc-editor");