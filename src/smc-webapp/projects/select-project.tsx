/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component for selecting a project.

import { Checkbox, Select } from "antd";
import {
  CSS,
  redux,
  React,
  useMemo,
  useState,
  useTypedRedux,
} from "../app-framework";
import { webapp_client } from "../webapp-client";
import { Loading } from "../r_misc";

type ProjectSelectionList = { id: string; title: string }[];

interface Props {
  exclude?: string[]; // project_id's to exclude
  at_top?: string[]; // include these projects at the top of the selector first (assuming they are in the project_map)
  onChange: (project_id: string) => void; // called when specific project selected
  value?: string; // currently selected project
  style?: CSS;
}

export const SelectProject: React.FC<Props> = ({
  exclude,
  at_top,
  onChange,
  value,
  style,
}) => {
  const project_map = useTypedRedux("projects", "project_map");
  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );

  // include deleted projects in the selector
  const [include_deleted, set_include_deleted] = useState<boolean>(false);
  // include hidden projects in the selector
  const [include_hidden, set_include_hidden] = useState<boolean>(false);

  const data: undefined | ProjectSelectionList = useMemo(() => {
    if (project_map == null) {
      return;
    }
    if (
      value &&
      project_map.get(value) == null &&
      !all_projects_have_been_loaded
    ) {
      redux.getActions("projects").load_all_projects();
      return;
    }
    let map = project_map;
    const { account_id } = webapp_client;
    const data: ProjectSelectionList = [];

    if (exclude != null) {
      for (const project_id of exclude) {
        if (project_id != null && map.has(project_id)) {
          map = map.delete(project_id);
        }
      }
    }

    if (at_top != null) {
      for (const project_id of at_top) {
        if (project_id != null && map.has(project_id)) {
          data.push({
            id: project_id,
            title: map.getIn([project_id, "title"]),
          });
          map = map.delete(project_id);
        }
      }
    }

    // sort by last edited (newest first)
    const v = map.valueSeq();
    v.sort(function (a, b) {
      if (a.get("last_edited") < b.get("last_edited")) {
        return 1;
      } else if (a.get("last_edited") > b.get("last_edited")) {
        return -1;
      }
      return 0;
    });

    const others: ProjectSelectionList = [];
    for (let i of v) {
      const is_deleted = !!i.get("deleted");
      const is_hidden = !!i.get("users").get(account_id).get("hide");
      if (
        i.get("project_id") == value ||
        (is_deleted == include_deleted && is_hidden == include_hidden)
      ) {
        others.push({ id: i.get("project_id"), title: i.get("title") });
      }
    }
    return data.concat(others);
  }, [project_map, exclude, at_top, include_deleted, include_hidden]);

  if (data == null) {
    return <Loading />;
  }

  return (
    <div style={style}>
      <div style={{ display: "flex", flexDirection: "row" }}>
        <Select
          style={{ marginRight: "15px", flex: 1 }}
          showSearch={true}
          placeholder={"Select a project..."}
          optionFilterProp={"children"}
          value={value}
          onChange={onChange}
          filterOption={(input, option) =>
            (option?.children.toLowerCase().indexOf(input.toLowerCase()) ??
              0) >= 0
          }
        >
          {data.map((v) => (
            <Select.Option key={v.id} value={v.id}>
              {v.title}
            </Select.Option>
          ))}
        </Select>
        <div style={{ margin: "auto" }}>
          <Checkbox
            checked={include_hidden}
            onChange={(e) => set_include_hidden(e.target.checked)}
          >
            Hidden
          </Checkbox>
          <Checkbox
            checked={include_deleted}
            onChange={(e) => set_include_deleted(e.target.checked)}
          >
            Deleted
          </Checkbox>
          {!all_projects_have_been_loaded && (
            <span>
              <br />
              <a
                onClick={() => redux.getActions("projects").load_all_projects()}
              >
                Load all projects...
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
