/*
Tabs for the open files in a project.

  function on_sort_end({ oldIndex, newIndex }): void {
    if (actions == null) return;
    actions.move_file_tab({
      old_index: oldIndex,
      new_index: newIndex,
    });
  }

*/

import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { file_tab_labels } from "../file-tab-labels";
import { FileTab } from "./file-tab";
import { useActions } from "@cocalc/frontend/app-framework";

export default function FileTabs({ openFiles, project_id, activeTab }) {
  const actions = useActions({ project_id });
  if (openFiles == null) {
    return null;
  }
  const paths: string[] = [];
  openFiles.map((path) => {
    if (path == null) {
      // see https://github.com/sagemathinc/cocalc/issues/3450
      // **This should never fail** so be loud if it does.
      throw Error(
        "BUG -- each entry in openFiles must be defined -- " +
          JSON.stringify(openFiles.toJS())
      );
    }
    paths.push(path);
  });
  const labels = file_tab_labels(paths);
  const items: TabsProps["items"] = [];
  for (let index = 0; index < labels.length; index++) {
    items.push({
      key: paths[index],
      label: (
        <FileTab
          key={paths[index]}
          project_id={project_id}
          path={paths[index]}
          label={labels[index]}
        />
      ),
    });
  }
  const onEdit = (path: string, action: "add" | "remove") => {
    if (actions == null) return;
    if (action == "add") {
      actions.set_active_tab("files");
    } else {
      // close given file
      actions.close_tab(path);
    }
  };
  return (
    <Tabs
      tabBarStyle={{ minHeight: "36px" }}
      onEdit={onEdit}
      style={{ width: "100%" }}
      size="small"
      items={items}
      activeKey={
        activeTab.startsWith("editor-") ? activeTab.slice("editor-".length) : ""
      }
      type={"editable-card"}
    />
  );
}
