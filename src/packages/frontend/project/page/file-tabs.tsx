/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tabs for the open files in a project.
*/

import type { TabsProps } from "antd";
import { Tabs } from "antd";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  SortableTabs,
  renderTabBar,
  useItemContext,
  useSortable,
} from "@cocalc/frontend/components/sortable-tabs";
import { EDITOR_PREFIX, path_to_tab } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { file_tab_labels } from "../file-tab-labels";
import { ActiveFlyoutToggleButton } from "./active-flyout-toggle-button";
import { FileTabActiveFileTopbar } from "./file-active-topbar";
import { FileTab } from "./file-tab";

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
  const flyout_active = useTypedRedux({ project_id }, "flyout_active");

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
      const path = keyToPath(key);
      // close given file
      actions.close_tab(path);
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
      actions.set_active_tab(path_to_tab(keyToPath(event?.active?.id)), {
        // noFocus -- critical to not focus when dragging or codemirror focus breaks on end of drag.
        // See  https://github.com/sagemathinc/cocalc/issues/7029
        noFocus: true,
      });
    }
  }

  function renderLeft() {
    if (flyout_active) return;
    return { left: <ActiveFlyoutToggleButton /> };
  }

  // we want the tab bar and the "file info bar" with the active files on the left have the same height
  const heightPX = 36;
  const styleTabs: CSS = {
    minHeight: `${heightPX}px`,
    height: `${heightPX}px`,
  } as const;
  const styleBar: CSS = { height: `${heightPX + 1}px` } as const;

  if (flyout_active) {
    return <FileTabActiveFileTopbar activeKey={activeKey} style={styleBar} />;
  } else {
    // ATTN: flex auto and width 1 come from https://github.com/ant-design/ant-design/issues/17934
    return (
      <div
        style={{
          flex: "auto",
          width: 1,
          overflow: "hidden",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
        }}
      >
        <SortableTabs
          items={keys}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <Tabs
            tabBarExtraContent={renderLeft()}
            animated={false}
            renderTabBar={renderTabBar}
            tabBarStyle={{ ...styleTabs }}
            onEdit={onEdit}
            style={{ width: "100%", ...styleBar }}
            size="small"
            items={items}
            activeKey={activeKey}
            type={"editable-card"}
            hideAdd={true}
            onChange={(key) => {
              if (actions == null) return;
              actions.set_active_tab(path_to_tab(keyToPath(key)));
            }}
            popupClassName={"cocalc-files-tabs-more"}
          />
        </SortableTabs>
      </div>
    );
  }
}
