/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Active files (editors) in the current project
// Note: there is no corresponding full page – instead, this is based on the "editor tabs"

import { Input, Radio } from "antd";

import {
  CSS,
  useActions,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Text } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { handle_log_click } from "@cocalc/frontend/project/history/utils";
import track from "@cocalc/frontend/user-tracking";
import {
  path_split,
  strictMod,
  tab_to_path,
  unreachable,
} from "@cocalc/util/misc";
import { FileListItem } from "./file-list-item";
import {
  FlyoutActiveMode,
  getFlyoutActiveMode,
  isFlyoutActiveMode,
} from "./state";

interface Props {
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function ActiveFlyout({ wrap }: Props): JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  const [mode, setActiveMode] = useState<FlyoutActiveMode>(
    getFlyoutActiveMode(project_id),
  );

  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  //   const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);

  function setMode(mode: FlyoutActiveMode) {
    if (isFlyoutActiveMode(mode)) {
      setActiveMode(mode);
      actions?.setFlyoutActiveMode(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  useEffect(() => actions?.setFlyoutActiveMode(mode), [mode]);

  const openFilesGrouped = useMemo(() => {
    // group openFiles, an array of strings for path/filename, by directory or type (file extension)
    const grouped: { [group: string]: string[] } = {};
    openFiles.forEach((path) => {
      const { head, tail } = path_split(path);
      const group = mode === "directory" ? head : tail.split(".")[1] ?? "";
      if (grouped[group] == null) grouped[group] = [];
      grouped[group].push(path);
    });
    return grouped;
  }, [openFiles, mode]);

  function renderConfiguration() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        size="small"
      >
        <Radio.Button value="directory">Directory</Radio.Button>
        <Radio.Button value="type">Type</Radio.Button>
      </Radio.Group>
    );
  }

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  // end of hooks

  function renderFileItem(path: string) {
    const isActive: boolean = activePath === path;

    return (
      <FileListItem
        key={path}
        mode="active"
        item={{ name: path, isopen: true, isactive: isActive }}
        multiline={true}
        onClick={(e) => {
          track("open-file", {
            project_id,
            path,
            how: "click-on-active-file-flyout",
          });
          handle_log_click(e, path, project_id);
        }}
        onClose={(e: React.MouseEvent, path: string) => {
          e.stopPropagation();
          actions?.close_tab(path);
        }}
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 1) {
            // middle mouse click
            actions?.close_tab(path);
          }
        }}
        tooltip={
          <>
            <Text code>{path}</Text>
          </>
        }
      />
    );
  }

  function list() {
    return Object.entries(openFilesGrouped).map(([group, entries]) => {
      return (
        <>
          <div>{group}</div>
          <div>
            {entries.map((path) => {
              return renderFileItem(path);
            })}
          </div>
        </>
      );
    });
  }

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      openFiles.size,
    );
    setScrollIdx(nextIdx);
  }

  function open(e: React.MouseEvent | React.KeyboardEvent, index: number) {
    const file: string | undefined = openFiles.get(index);
    if (file == null) return;
    track("open-file", {
      project_id,
      path: file,
      how: "keypress-on-log-file-flyout",
    });
    handle_log_click(e, file, project_id);
  }

  function onKeyDownHandler(e) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // return key pressed
    else if (e.code === "Enter") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (filterTerm != "" && openFiles.size > 0) {
        open(e, 0);
      }
    }

    // if esc key is pressed, empty the search term and reset scroll index
    if (e.key === "Escape") {
      //   handleOnChange("");
    }
  }

  return (
    <>
      {renderConfiguration()}
      <Input
        placeholder="Filter..."
        style={{ flex: "1", marginRight: "10px" }}
        size="small"
        value={filterTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setFilterTerm(e.target.value);
        }}
        onKeyDown={onKeyDownHandler}
        allowClear
        prefix={<Icon name="search" />}
      />
      {wrap(list(), { marginTop: "10px" })}
    </>
  );
}
