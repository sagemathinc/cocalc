/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space, Typography } from "antd";
import { AppRedux, useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { trunc_middle } from "@cocalc/util/misc";

import { CourseActions } from "../actions";
import { CourseUnitCard } from "../common";
import type { UserMap } from "../../todo-types";
import type { HandoutRecord, StudentsMap } from "../store";
import * as styles from "../styles";

interface HandoutProps {
  backgroundColor?: string;
  frame_id?: string;
  handout: HandoutRecord;
  is_expanded?: boolean;
  name: string;
  project_id: string;
  redux: AppRedux;
  students: StudentsMap;
  user_map: UserMap;
}

export function Handout({
  backgroundColor,
  frame_id,
  handout,
  is_expanded,
  name,
  project_id,
  redux,
  students,
  user_map,
}: HandoutProps) {
  const actions = useActions<CourseActions>({ name });
  const handoutName = (
    <>
      {trunc_middle(handout.get("path"), 80)}
      {handout.get("deleted") ? <b> (deleted)</b> : undefined}
    </>
  );

  return (
    <div style={is_expanded ? styles.selected_entry : styles.entry_style}>
      <Space
        align="center"
        style={{ backgroundColor, paddingInlineStart: 8, width: "100%" }}
      >
        <Typography.Title level={5}>
          <a
            href=""
            onClick={(e) => {
              e.preventDefault();
              actions.toggle_item_expansion("handout", handout.get("handout_id"));
            }}
          >
            <Space>
              <Icon name={is_expanded ? "caret-down" : "caret-right"} />
              {handoutName}
            </Space>
          </a>
        </Typography.Title>
      </Space>
      {is_expanded ? (
        <CourseUnitCard
          unit={handout}
          name={name}
          redux={redux}
          actions={actions}
          students={students}
          user_map={user_map}
          frame_id={frame_id}
          project_id={project_id}
        />
      ) : null}
    </div>
  );
}
