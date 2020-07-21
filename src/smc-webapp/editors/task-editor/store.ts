/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { cmp } from "smc-util/misc";
import { Store } from "../../app-framework";
import { TaskMap, TaskState } from "./types";

export class TaskStore extends Store<TaskState> {
  public get_positions(): number[] {
    const v: number[] = [];
    this.get("tasks")?.forEach((task: TaskMap) => {
      const position = task.get("position");
      if (position != null) {
        v.push(position);
      }
    });
    return v.sort(cmp); // cmp by <, > instead of string!
  }
}
