/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
History viewer for Tasks notebooks  --- very similar to same file in jupyter/ directory. Refactor!
*/

import { Checkbox } from "antd";
import { fromJS, Map } from "immutable";
import TaskList from "./list";
import { useState } from "../../app-framework";
import { cmp } from "@cocalc/util/misc";
import { Tasks } from "./types";

const SHOW_DONE_STYLE = {
  fontSize: "12pt",
  color: "#666",
  padding: "5px 15px",
  borderBottom: "1px solid lightgrey",
} as const;

export function TasksHistoryViewer({ doc, project_id, path, font_size }) {
  const [show_done, set_show_done] = useState(false);

  function render_task_list(doc) {
    let tasks: Tasks = Map();
    const v: [number | undefined, string][] = [];
    doc.get().forEach((task) => {
      const task_id = task.get("task_id");
      tasks = tasks.set(task_id, task);
      if ((show_done || !task.get("done")) && !task.get("deleted")) {
        v.push([task.get("last_edited"), task_id]);
      }
    });
    v.sort((a, b) => -cmp(a[0], b[0]));
    const visible = fromJS(v.map((x) => x[1]));

    return (
      <TaskList
        path={path}
        project_id={project_id}
        tasks={tasks}
        visible={visible}
        read_only={true}
        font_size={font_size}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "hidden",
      }}
    >
      <div style={SHOW_DONE_STYLE}>
        <Checkbox
          checked={show_done}
          onChange={() => set_show_done(!show_done)}
        >
          Show finished tasks
        </Checkbox>
      </div>
      {doc == null ? <span>Unknown version</span> : render_task_list(doc)}
    </div>
  );
}
