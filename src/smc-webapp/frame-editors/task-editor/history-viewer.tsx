/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
History viewer for Tasks notebooks  --- very similar to same file in jupyter/ directory. Refactor!
*/

import { fromJS, Map } from "immutable";
import { TaskList } from "./list";
import { CSS, React, useState } from "../../app-framework";
import { Icon } from "../../r_misc";
import { cmp } from "smc-util/misc";
import { SyncDB } from "smc-util/sync/editor/db";
import { Tasks } from "./types";

const SHOW_DONE_STYLE: CSS = {
  fontSize: "12pt",
  color: "#666",
  padding: "5px 15px",
  borderBottom: "1px solid lightgrey",
} as const;

interface Props {
  syncdb: SyncDB;
  version: Date;
  font_size: number;
}

export const TasksHistoryViewer: React.FC<Props> = ({
  syncdb,
  version,
  font_size,
}) => {
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
        path={syncdb.get_path()}
        project_id={syncdb.get_project_id()}
        tasks={tasks}
        visible={visible}
        read_only={true}
        font_size={font_size}
      />
    );
  }

  const doc = syncdb.version(version);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "hidden",
      }}
    >
      <div onClick={() => set_show_done(!show_done)} style={SHOW_DONE_STYLE}>
        <Icon name={show_done ? "check-square-o" : "square-o"} /> Show done
        tasks
      </div>
      {doc == null ? <span>Unknown version</span> : render_task_list(doc)}
    </div>
  );
};
