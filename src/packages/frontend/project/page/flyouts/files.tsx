/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, Radio, Space, Tooltip } from "antd";
import { delay } from "awaiting";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import {
  CSS,
  React,
  TypedMap,
  redux,
  useActions,
  useEffect,
  useIsMountedRef,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { ListingItem } from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/project/websocket/listings";
import track from "@cocalc/frontend/user-tracking";
import { path_to_file, should_open_in_foreground } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { EditorFileInfoDropdown } from "../../../editors/file-info-dropdown";

const ITEM_LINE_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  width: "100%",
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  paddingBottom: "5px",
  paddingTop: "5px",
  paddingLeft: "5px",
  paddingRight: "5px",
  color: COLORS.GRAY_D,
} as const;

const ITEM_STYLE: CSS = {
  flex: "1 1 auto",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function FilesFlyout({ project_id }): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const actions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");
  const directoryListings = useTypedRedux({ project_id }, "directory_listings");
  const activeFileSort: TypedMap<{
    column_name: string;
    is_descending: boolean;
  }> = useTypedRedux({ project_id }, "active_file_sort");
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");

  // TODO: display_listing is usually undefined. WHY?
  // const displayed_listing: {
  //   listing: ListingItem[];
  //   error: any;
  //   file_map: Map<string, any>;
  // } = useTypedRedux({ project_id }, "displayed_listing");

  const [search, setSearch] = useState<string>("");

  // copied roughly from directoy-selector.tsx
  useEffect(() => {
    // Run the loop below every 30s until project_id or current_path changes (or unmount)
    // in which case loop stops.  If not unmount, then get new loops for new values.
    if (!project_id) return;
    const state = { loop: true };
    (async () => {
      while (state.loop && isMountedRef.current) {
        // Component is mounted, so call watch on all expanded paths.
        const listings = redux.getProjectStore(project_id).get_listings();
        listings.watch(current_path);
        await delay(WATCH_THROTTLE_MS);
      }
    })();
    return () => {
      state.loop = false;
    };
  }, [project_id, current_path]);

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::${current_path}`,
  });

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [directoryFiles, _] = useMemo((): [ListingItem[], boolean] => {
    if (directoryListings == null) return [[], true];
    const files = directoryListings.get(current_path);
    if (files == null) return [[], true];
    if (typeof files === "string") return [[], true];
    const procFiles = files
      .filter(
        (file: TypedMap<ListingItem>) =>
          search == "" ||
          (allLowerCase
            ? file.get("name").toLowerCase().includes(search)
            : file.get("name").includes(search))
      )
      .filter(
        (file: TypedMap<ListingItem>) =>
          hidden || !file.get("name").startsWith(".")
      )
      .sort((a, b) => {
        // This replicated what project_store is doing
        const col = activeFileSort.get("column_name");
        switch (col) {
          case "name":
            return a.get("name").localeCompare(b.get("name"));
          case "size":
            return a.get("size", 0) - b.get("size", 0);
          case "time":
            return b.get("mtime", 0) - a.get("mtime", 0);
          case "type":
            const aDir = a.get("isdir", false);
            const bDir = b.get("isdir", false);
            if (aDir && !bDir) return -1;
            if (!aDir && bDir) return 1;
            const aExt = a.get("name", "").split(".").pop();
            const bExt = b.get("name", "").split(".").pop();
            return aExt.localeCompare(bExt);
        }
      })
      .map((file: TypedMap<ListingItem>) => {
        const fullPath = path_to_file(current_path, file.get("name"));
        if (openFiles.some((path) => path == fullPath)) {
          return file.set("isopen", true);
        } else {
          return file;
        }
      });

    const ordered = activeFileSort.get("is_descending")
      ? procFiles.reverse().toJS()
      : procFiles.toJS();

    const isEmpty = ordered.length === 0;

    if (current_path != "") {
      ordered.unshift({
        name: "..",
        isdir: true,
      });
    }

    return [ordered, isEmpty];
  }, [directoryListings, activeFileSort, hidden, search, openFiles]);

  // *** END HOOKS ***

  if (directoryListings == null) {
    (async () => {
      await delay(0);
      // Ensure store gets initialized before redux
      // E.g., for copy between projects you make this
      // directory selector before even opening the project.
      redux.getProjectStore(project_id);
    })();
    return <Loading />;
  }

  if (directoryListings.get(current_path) == null) {
    (async () => {
      // Must happen in a different render loop, hence the delay, because
      // fetch can actually update the store in the same render loop.
      await delay(0);
      redux
        .getProjectActions(project_id)
        ?.fetch_directory_listing({ path: current_path });
    })();
    return <Loading />;
  }

  // if there are no uppercase chars in search
  const allLowerCase = search === search.toLowerCase();

  function open(e: React.MouseEvent, index: number) {
    const file = directoryFiles[index];
    const fullPath = path_to_file(current_path, file.name);
    if (file.isdir) {
      actions?.set_current_path(fullPath);
      setSearch("");
    } else {
      const foreground = should_open_in_foreground(e);
      track("open-file", {
        project_id,
        path: fullPath,
        how: "click-on-listing-flyout",
      });
      actions?.open_file({
        path: fullPath,
        foreground,
      });
    }
  }

  function renderSortButton(name: string, display: string): JSX.Element {
    const isActive = activeFileSort.get("column_name") === name;
    const direction = isActive ? (
      <Icon
        style={{ marginLeft: "5px" }}
        name={activeFileSort.get("is_descending") ? "caret-up" : "caret-down"}
      />
    ) : undefined;

    return (
      <Radio.Button
        value={name}
        style={{ background: isActive ? COLORS.ANTD_BG_BLUE_L : undefined }}
        onClick={() => actions?.set_sorted_file_column(name)}
      >
        {display}
        {direction}
      </Radio.Button>
    );
  }

  function renderHeader(): JSX.Element {
    return (
      <Space
        direction="vertical"
        style={{
          paddingBottom: "10px",
          paddingRight: "5px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Radio.Group defaultValue="a" size="small">
            {renderSortButton("name", "Name")}
            {renderSortButton("size", "Size")}
            {renderSortButton("time", "Time")}
            {renderSortButton("type", "Type")}
          </Radio.Group>
          <Space direction="horizontal" size={"small"}>
            <Tooltip title="Create a new file">
              <Button
                size="small"
                type="primary"
                onClick={() => actions?.toggleFlyout("new")}
              >
                <Icon name={"plus-circle"} />
              </Button>
            </Tooltip>
          </Space>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <Input
            placeholder="Filter..."
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1", marginRight: "10px" }}
            allowClear
            prefix={<Icon name="search" />}
          />
          <Button
            size="small"
            style={{ flex: "0" }}
            onClick={() => actions?.setState({ show_hidden: !hidden })}
          >
            <Icon name={hidden ? "eye" : "eye-slash"} />
          </Button>
        </div>
      </Space>
    );
  }

  function renderItemIcon(item: ListingItem): JSX.Element {
    const style = { fontSize: "120%", marginRight: "5px" };
    if (item.isdir) {
      return <Icon name="folder-open" style={style} />;
    } else {
      const ficon = file_options(item.name)?.icon ?? "file";

      return (
        <EditorFileInfoDropdown
          button={false}
          filename={path_to_file(current_path, item.name)}
          project_id={project_id}
          title={<Icon name={ficon} style={style} />}
          style={{ margin: 0 }}
          mode="flyout"
        />
      );
    }
  }

  function renderCloseItem(item: ListingItem): JSX.Element {
    const { name } = item;
    return (
      <Icon
        name="times-circle"
        style={{ flex: "0", fontSize: "120%" }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          actions?.close_tab(path_to_file(current_path, name));
        }}
      />
    );
  }

  function renderListItem(index: number, item: ListingItem) {
    return (
      <>
        <div
          className="cc-project-flyout-file-item"
          style={{
            ...ITEM_LINE_STYLE,
            ...(item.isopen
              ? {
                  fontWeight: "bold",
                  color: COLORS.PROJECT.FIXED_LEFT_ACTIVE,
                  backgroundColor: COLORS.GRAY_LL,
                }
              : {}),
          }}
        >
          {renderItemIcon(item)}{" "}
          <div style={ITEM_STYLE} onClick={(e) => open(e, index)}>
            {item.name}
          </div>
          {item.isopen ? renderCloseItem(item) : null}
        </div>
      </>
    );
  }

  function renderListing(): JSX.Element {
    return (
      <Virtuoso
        ref={virtuosoRef}
        style={{}}
        increaseViewportBy={10}
        totalCount={directoryFiles.length}
        itemContent={(index) => {
          const file = directoryFiles[index];
          if (file == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return renderListItem(index, file);
        }}
        {...virtuosoScroll}
      />
    );
  }

  function renderList(): JSX.Element {
    const files = directoryListings.get(current_path);
    if (files == null) return <Loading />;

    return (
      <>
        {renderHeader()}
        {renderListing()}
      </>
    );
  }

  return renderList();
}
