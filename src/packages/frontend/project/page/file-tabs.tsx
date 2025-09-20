/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Tabs for the open files in a project.
*/

import type { TabsProps } from "antd";
import { Tabs } from "antd";
import { useActions } from "@cocalc/frontend/app-framework";
import {
  renderTabBar,
  SortableTabs,
  useItemContext,
  useSortable,
} from "@cocalc/frontend/components/sortable-tabs";
import { EDITOR_PREFIX, path_to_tab } from "@cocalc/util/misc";
import { file_tab_labels } from "../file-tab-labels";
import { FileTab } from "./file-tab";

const MIN_WIDTH = 48;

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
      style={{
        ...(width != null
          ? { width: Math.max(MIN_WIDTH, width + 15), marginRight: "-10px" }
          : undefined),
      }}
    />
  );
}

// This mapping back and forth is needed because of, I guess, a bug
// in antd, where the key can't include a double quote.  This was
// the closest thing in the antd bug tracker:
//   https://github.com/ant-design/ant-design/issues/33928
// I hope there are no other special characters to exclude.
// This doesn't impact projects since they use the project_id.
// Note the "unused unicode character"; we use
// this same trick in various places throughout cocalc.
function pathToKey(s: string): string {
  if (s.includes("\uFE35")) {
    throw Error(`invalid path: ${JSON.stringify(s)}`);
  }
  return s.replace(/"/g, "\uFE35");
}

function keyToPath(s: string): string {
  return s.replace(/\uFE35/g, '"');
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
          JSON.stringify(openFiles.toJS()),
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
  const onEdit = (key: string, action: "add" | "remove") => {
    if (actions == null) return;
    if (action == "add") {
      actions.set_active_tab("files");
    } else {
      if (key) {
        const path = keyToPath(key);
        // close given file
        actions.close_tab(path);
      }
    }
  };

  function onDragEnd(event) {
    if (actions == null) return;
    const { active, over } = event;
    if (active == null || over == null) {
      return;
    }
    setTimeout(() => {
      // This is a scary hack to fix https://github.com/sagemathinc/cocalc/issues/7029
      // which is I think working around some weirdness/optimization in CodeMirror 5.
      // I hate doing this, but it's better than the alternatives I can figure out right now.
      actions.show();
    }, 250);

    if (active.id == over.id) {
      return;
    }
    actions.move_file_tab({
      old_index: keys.indexOf(active.id),
      new_index: keys.indexOf(over.id),
    });
  }

  const activeKey = activeTab.startsWith(EDITOR_PREFIX)
    ? pathToKey(activeTab.slice(EDITOR_PREFIX.length))
    : "";

  function onDragStart(event) {
    if (actions == null) return;
    if (event?.active?.id != activeKey) {
      const key = event?.active?.id;
      if (key) {
        actions.set_active_tab(path_to_tab(keyToPath(key)), {
          // noFocus -- critical to not focus when dragging or codemirror focus breaks on end of drag.
          // See  https://github.com/sagemathinc/cocalc/issues/7029
          noFocus: true,
        });
      }
    }
  }

  return (
    <SortableTabs items={keys} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Tabs
        animated={false}
        renderTabBar={renderTabBar}
        tabBarStyle={{
          minHeight: "36px",
          background: "#e8e8e8",
          borderTop: "2px solid lightgrey",
        }}
        onEdit={onEdit}
        style={{ width: "100%" }}
        size="small"
        items={items}
        activeKey={activeKey}
        type={"editable-card"}
        onChange={(key) => {
          if (actions == null || !key) return;
          actions.set_active_tab(path_to_tab(keyToPath(key)));
        }}
        popupClassName={"cocalc-files-tabs-more"}
      />
    </SortableTabs>
  );
}
