/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions involving working with groupings.
*/
import { is_valid_uuid_string, uuid } from "smc-util/misc";
import { CourseActions } from "../actions";

export class GroupingsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
    console.log("making GroupingsActions using", this.course_actions);
  }

  public create_grouping(): string {
    const grouping_id = uuid();
    this.course_actions.set({
      table: "groupings",
      grouping_id,
    });
    return grouping_id;
  }

  public set(
    grouping_id: string,
    obj: { title?: string; description?: string; deleted?: boolean },
    save: boolean = true
  ): void {
    if (!is_valid_uuid_string(grouping_id)) {
      throw Error("grouping_id must be a uuid");
    }
    this.course_actions.set(
      {
        ...{
          table: "groupings",
          grouping_id,
        },
        ...obj,
      },
      save
    );
  }
}
