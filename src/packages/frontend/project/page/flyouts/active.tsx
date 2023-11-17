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
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { handle_log_click } from "@cocalc/frontend/project/history/utils";
import track from "@cocalc/frontend/user-tracking";
import { strictMod, tab_to_path, unreachable } from "@cocalc/util/misc";
import { FLYOUT_EXTRA_WIDTH_PX } from "./consts";
import {
  FlyoutActiveMode,
  getFlyoutActiveMode,
  isFlyoutActiveMode,
} from "./state";

interface Props {
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
  flyoutWidth: number;
}

export function ActiveFlyout({ wrap, flyoutWidth }: Props): JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const mode: FlyoutActiveMode = useTypedRedux(
    { project_id },
    "flyout_active_mode",
  );

  useEffect(() => {
    if (mode == null) {
      actions?.setFlyoutActiveMode(getFlyoutActiveMode(project_id));
    }
  }, [mode]);

  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  //   const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  //   const virtuosoScroll = useVirtuosoScrollHook({
  //     cacheId: `${project_id}::flyout::log`,
  //   });
  //   const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [filterTerm, setFilterTerm] = useState<string>("");

  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scollIdxHide, setScrollIdxHide] = useState<boolean>(false);

  function setMode(mode: FlyoutActiveMode) {
    if (isFlyoutActiveMode(mode)) {
      actions?.setFlyoutActiveMode(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  useEffect(() => actions?.setFlyoutActiveMode(mode), [mode]);

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

  const groups = useMemo(() => {
    switch (mode) {
      case "directory":
        return "directory";
      case "type":
        return "type";
      default:
        unreachable(mode);
    }
  }, [mode]);

  const showExtra = useMemo(
    () => flyoutWidth > FLYOUT_EXTRA_WIDTH_PX,
    [flyoutWidth],
  );

  console.log({ activePath, scollIdxHide, actions, showExtra });

  // end of hooks

  //   function renderFileItemExtra(entry: OpenedFile) {
  //     if (!showExtra) return null;
  //     return "EXTRA " + entry.filename;
  //   }

  //   function renderFileItem(index: number, entry: OpenedFile) {
  //     const time = entry.time;
  //     // const account_id = entry.account_id;
  //     const path = entry.filename;
  //     const isOpened: boolean = openFiles.some((p) => p === path);
  //     const isActive: boolean = activePath === path;

  //     return (
  //       <FileListItem
  //         item={{ name: path, isopen: isOpened, isactive: isActive }}
  //         extra={renderFileItemExtra(entry)}
  //         itemStyle={fileItemStyle(time?.getTime())}
  //         multiline={true}
  //         selected={!scollIdxHide && index === scrollIdx}
  //         onClick={(e) => {
  //           track("open-file", {
  //             project_id,
  //             path,
  //             how: "click-on-active-file-flyout",
  //           });
  //           handle_log_click(e, path, project_id);
  //         }}
  //         onClose={(e: React.MouseEvent, path: string) => {
  //           e.stopPropagation();
  //           actions?.close_tab(path);
  //         }}
  //         onMouseDown={(e: React.MouseEvent) => {
  //           if (e.button === 1) {
  //             // middle mouse click
  //             actions?.close_tab(path);
  //           }
  //         }}
  //         tooltip={<>...</>}
  //       />
  //     );
  //   }

  function list(): JSX.Element {
    return (
      <div>
        {groups}
        <br />
        {openFiles.map((path) => {
          return <div key={path}>{path}</div>;
        })}
      </div>
    );

    // return (
    //   <Virtuoso
    //     ref={virtuosoRef}
    //     style={{}}
    //     increaseViewportBy={10}
    //     totalCount={log.length}
    //     itemContent={(index) => {
    //       const entry = log[index];
    //       if (entry == null) {
    //         // shouldn't happen
    //         return <div key={index} style={{ height: "1px" }}></div>;
    //       }
    //       switch (mode) {
    //         case "files":
    //           return renderFileItem(index, entry);
    //         case "history":
    //           return renderHistoryItem(index, entry);
    //       }
    //     }}
    //     {...virtuosoScroll}
    //   />
    // );
  }

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      openFiles.size,
    );
    setScrollIdx(nextIdx);
    // virtuosoRef.current?.scrollToIndex({
    //   index: nextIdx,
    //   align: "center",
    // });
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
        onFocus={() => setScrollIdxHide(false)}
        onBlur={() => setScrollIdxHide(true)}
        allowClear
        prefix={<Icon name="search" />}
      />
      {wrap(list(), { marginTop: "10px" })}
    </>
  );
}
