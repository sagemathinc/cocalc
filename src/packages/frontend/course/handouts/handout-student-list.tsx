/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { useMemo } from "react";
import ScrollableList from "@cocalc/frontend/components/scrollable-list";
import { trunc_middle } from "@cocalc/util/misc";
import type { UserMap } from "../../todo-types";
import type { CourseActions } from "../actions";
import type {
  CourseStore,
  HandoutRecord,
  SortDescription,
  StudentsMap,
} from "../store";
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

export function StudentListForHandout({
  frame_id,
  name,
  user_map,
  students,
  handout,
  actions,
}: StudentListForHandoutProps) {
  const intl = useIntl();
  const active_student_sort: SortDescription = useRedux(
    name,
    "active_student_sort",
  );
  const student_list = useMemo(() => {
    const v0 = util.parse_students(students, user_map, redux, intl);

    // Remove deleted students
    const v1: any[] = [];
    for (const x of v0) {
      if (!x.deleted) {
        v1.push(x);
      }
    }
    v1.sort(util.pick_student_sorter(active_student_sort.toJS()));
    const student_list: string[] = v1.map((x) => x.student_id);
    return student_list;
  }, [students, user_map, active_student_sort]);

  function get_store(): CourseStore {
    const store = redux.getStore(name);
    if (store == null) throw Error("store must be defined");
    return store as unknown as CourseStore;
  }

  function render_students() {
    return (
      <ScrollableList
        virtualize
        rowCount={student_list.length}
        rowRenderer={({ key }) => render_student_info(key)}
        rowKey={(index) => student_list[index]}
        cacheId={`course-handout-${handout.get("handout_id")}-${
          actions.name
        }-${frame_id}`}
      />
    );
  }

  function render_student_info(student_id: string) {
    const info = get_store().student_handout_info(
      student_id,
      handout.get("handout_id"),
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
}
