/*
Tabs for the open files in a project.
*/

import { Tabs } from "antd";
import type { TabsProps } from "antd";
import { file_tab_labels } from "../file-tab-labels";
import { FileTab } from "./file-tab";
import { useActions } from "@cocalc/frontend/app-framework";
import {
  renderTabBar,
  SortableTabs,
  useSortable,
  useItemContext,
} from "@cocalc/frontend/components/sortable-tabs";
import { path_to_tab } from "@cocalc/util/misc";

function Label({ path, project_id, label }) {
  const { width } = useItemContext();
  const { active } = useSortable({ id: project_id });
  return (
    <FileTab
      key={path}
      project_id={project_id}
      path={path}
      label={label}
      noPopover={active != null}
      style={width != null ? { width } : undefined}
    />
  );
}

// This mapping back and forth is needed because of, I guess, a bug
// in antd, where the key can't include a double quote.  This was
// the closest thing in the antd bug tracker:
//   https://github.com/ant-design/ant-design/issues/33928
// I hope there are no other special characters to exclude.
// This doesn't impact projects since they use the project_id.
function pathToKey(s: string): string {
  return s.replace(/"/g, '\\"');
}

function keyToPath(s: string): string {
  return s.replace(/\\"/g, '"');
}

export default function FileTabs({ openFiles, project_id, activeTab }) {
  const actions = useActions({ project_id });
  if (openFiles == null) {
    return null;
  }
  const paths: string[] = [];
  const keys: string[] = [];
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
    keys.push(pathToKey(path));
  });

  const labels = file_tab_labels(paths);
  const items: TabsProps["items"] = [];

  for (let index = 0; index < labels.length; index++) {
    items.push({
      key: pathToKey(paths[index]),
      label: (
        <Label
          path={paths[index]}
          project_id={project_id}
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

  function onDragEnd(event) {
    if (actions == null) return;
    const { active, over } = event;
    if (active == null || over == null || active.id == over.id) return;
    actions.move_file_tab({
      old_index: keys.indexOf(active.id),
      new_index: keys.indexOf(over.id),
    });
  }

  const activeKey = activeTab.startsWith("editor-")
    ? pathToKey(activeTab.slice("editor-".length))
    : "";

  function onDragStart(event) {
    if (actions == null) return;
    if (event?.active?.id != activeKey) {
      actions.set_active_tab(path_to_tab(keyToPath(event?.active?.id)));
    }
  }

  return (
    <SortableTabs items={keys} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Tabs
        animated={false}
        renderTabBar={renderTabBar}
        tabBarStyle={{ minHeight: "36px" }}
        onEdit={onEdit}
        style={{ width: "100%" }}
        size="small"
        items={items}
        activeKey={activeKey}
        type={"editable-card"}
        onChange={(path) => {
          if (actions == null) return;
          actions.set_active_tab(path_to_tab(path));
        }}
      />
    </SortableTabs>
  );
}
