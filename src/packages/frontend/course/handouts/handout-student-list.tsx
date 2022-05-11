/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
// React Libraries
import {
  React,
  redux,
  Rendered,
  useMemo,
} from "@cocalc/frontend/app-framework";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { cmp, is_different, trunc_middle } from "@cocalc/util/misc";
import { UserMap } from "../../todo-types";
import { CourseActions } from "../actions";
import { CourseStore, HandoutRecord, StudentsMap } from "../store";
// CoCalc and course components
import * as util from "../util";
import { StudentHandoutInfoHeader } from "./handout-info-header";
import { StudentHandoutInfo } from "./handouts-info-panel";

interface StudentListForHandoutProps {
  frame_id?: string;
  name: string;
  user_map: UserMap;
  students: StudentsMap;
  handout: HandoutRecord;
  actions: CourseActions;
}

function isSame(prev, next) {
  return !is_different(prev, next, ["handout", "students", "user_map"]);
}

export const StudentListForHandout: React.FC<StudentListForHandoutProps> =
  React.memo((props: StudentListForHandoutProps) => {
    const { frame_id, name, user_map, students, handout, actions } = props;

    const student_list = useMemo(() => {
      const v0: any[] = util.immutable_to_list(students, "student_id");

      // Remove deleted students
      const v1: any[] = [];
      for (const x of v0) {
        if (!x.deleted) v1.push(x);
        const user = user_map.get(x.account_id);
        if (user != null) {
          const first_name = user.get("first_name", "");
          const last_name = user.get("last_name", "");
          x.sort = (last_name + " " + first_name).toLowerCase();
        } else if (x.email_address != null) {
          x.sort = x.email_address.toLowerCase();
        }
      }
      v1.sort((a, b) => cmp(a.sort, b.sort));
      const student_list: string[] = v1.map((x) => x.student_id);
      return student_list;
    }, [students, user_map]);

    function get_store(): CourseStore {
      const store = redux.getStore(name);
      if (store == null) throw Error("store must be defined");
      return store as unknown as CourseStore;
    }

    function render_students(): Rendered {
      return (
        <ScrollableList
          rowCount={student_list.length}
          rowRenderer={({ key }) => render_student_info(key)}
          rowKey={(index) => student_list[index]}
          cacheId={`course-handout-${handout.get("handout_id")}-${
            actions.name
          }-${frame_id}`}
        />
      );
    }

    function render_student_info(student_id: string): Rendered {
      const info = get_store().student_handout_info(
        student_id,
        handout.get("handout_id")
      );
      return (
        <StudentHandoutInfo
          key={student_id}
          actions={actions}
          info={info}
          title={trunc_middle(get_store().get_student_name(student_id), 40)}
        />
      );
    }

    return (
      <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
        <StudentHandoutInfoHeader key="header" title="Student" />
        {render_students()}
      </div>
    );
  }, isSame);
