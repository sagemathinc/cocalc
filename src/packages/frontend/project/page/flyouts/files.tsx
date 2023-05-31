/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, InputRef, Radio, Space, Tooltip } from "antd";
import { delay } from "awaiting";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
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
import { Icon, Loading, TimeAgo } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { EditorFileInfoDropdown } from "@cocalc/frontend/editors/file-info-dropdown";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/project/websocket/listings";
import track from "@cocalc/frontend/user-tracking";
import {
  human_readable_size,
  path_to_file,
  plural,
  search_match,
  search_split,
  should_open_in_foreground,
  strictMod,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useProjectState } from "../project-state-hook";
import { FileListItem, fileItemStyle } from "./components";

export function FilesFlyout({ project_id }): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const refInput = useRef<InputRef>(null);
  const actions = useActions({ project_id });
  const project_state = useProjectState(project_id);
  const projectIsRunning = project_state?.get("state") === "running";
  const current_path = useTypedRedux({ project_id }, "current_path");
  const directoryListings = useTypedRedux({ project_id }, "directory_listings");
  const activeFileSort: TypedMap<{
    column_name: string;
    is_descending: boolean;
  }> = useTypedRedux({ project_id }, "active_file_sort");
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const show_masked = useTypedRedux({ project_id }, "show_masked");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const [search, setSearch] = useState<string>("");
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  // TODO: display_listing is usually undefined. WHY?
  // const displayed_listing: {
  //   listing: ListingItem[];
  //   error: any;
  //   file_map: Map<string, any>;
  // } = useTypedRedux({ project_id }, "displayed_listing");

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
    cacheId: `${project_id}::flyout::files::${current_path}`,
  });

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const directoryFiles = useMemo((): DirectoryListing => {
    if (directoryListings == null) return [];
    const filesStore = directoryListings.get(current_path);
    if (filesStore == null) return [];

    // TODO this is an error, process it
    if (typeof filesStore === "string") return [];

    const files: DirectoryListing = filesStore.toJS();
    compute_file_masks(files);
    const searchWords = search_split(search.toLowerCase());

    const procFiles = files
      .filter((file: DirectoryListingEntry) => {
        file.name ??= ""; // sanitization

        if (search === "") return true;
        const fName = file.name.toLowerCase();
        return (
          search_match(fName, searchWords) ||
          ((file.isdir ?? false) && search_match(`${fName}/`, searchWords))
        );
      })
      .filter(
        (file: DirectoryListingEntry) => show_masked || !(file.mask === true)
      )
      .filter(
        (file: DirectoryListingEntry) => hidden || !file.name.startsWith(".")
      );

    procFiles.sort((a, b) => {
      // This replicated what project_store is doing
      const col = activeFileSort.get("column_name");
      switch (col) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return (a.size ?? 0) - (b.size ?? 0);
        case "time":
          return (b.mtime ?? 0) - (a.mtime ?? 0);
        case "type":
          const aDir = a.isdir ?? false;
          const bDir = b.isdir ?? false;
          if (aDir && !bDir) return -1;
          if (!aDir && bDir) return 1;
          const aExt = a.name.split(".").pop() ?? "";
          const bExt = b.name.split(".").pop() ?? "";
          return aExt.localeCompare(bExt);
        default:
          console.warn(`flyout/files: unknown sort column ${col}`);
          return 0;
      }
    });

    for (const file of procFiles) {
      const fullPath = path_to_file(current_path, file.name);
      if (openFiles.some((path) => path == fullPath)) {
        file.isopen = true;
      }
    }

    if (activeFileSort.get("is_descending")) {
      procFiles.reverse(); // inplace op
    }

    if (current_path != "") {
      procFiles.unshift({
        name: "..",
        isdir: true,
      });
    }

    return procFiles;
  }, [
    directoryListings,
    activeFileSort,
    hidden,
    search,
    openFiles,
    show_masked,
    current_path,
  ]);

  useEffect(() => {
    // if we change directory *and* use the keyboard, we re-focus the input
    if (scrollIdx != null) {
      refInput.current?.focus();
    }
    setScrollIdx(null);
  }, [current_path]);

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

  function open(e: React.MouseEvent | React.KeyboardEvent, index: number) {
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

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      directoryFiles.length
    );
    setScrollIdx(nextIdx);
    virtuosoRef.current?.scrollToIndex({
      index: nextIdx,
      align: "center",
    });
  }

  function filterKeyHandler(e: React.KeyboardEvent) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // left arrow key: go up a directory
    else if (e.code === "ArrowLeft") {
      if (current_path != "") {
        actions?.set_current_path(
          current_path.split("/").slice(0, -1).join("/")
        );
      }
    }

    // return key pressed
    else if (e.code === "Enter") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      }
    }
  }

  function renderUpload() {
    if (student_project_functionality.disableUploads) return;
    return (
      <Tooltip title="Upload a file" placement="bottom">
        <Button
          size="small"
          disabled={!projectIsRunning}
          className="upload-button-flyout"
        >
          <Icon name={"upload"} />
        </Button>
      </Tooltip>
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
          <Radio.Group size="small">
            {renderSortButton("name", "Name")}
            {renderSortButton("size", "Size")}
            {renderSortButton("time", "Time")}
            {renderSortButton("type", "Type")}
          </Radio.Group>
          <Space direction="horizontal" size={"small"}>
            {renderUpload()}
            <Tooltip title="Create a new file" placement="bottom">
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
            ref={refInput}
            placeholder="Filter..."
            size="small"
            value={search}
            onKeyDown={filterKeyHandler}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: "1", marginRight: "10px" }}
            allowClear
            prefix={<Icon name="search" />}
          />
          <Space direction="horizontal" size="small">
            <BootstrapButton
              title={hidden ? "Hide hidden files" : "Show hidden files"}
              bsSize="xsmall"
              style={{ flex: "0" }}
              onClick={() => actions?.setState({ show_hidden: !hidden })}
            >
              <Icon name={hidden ? "eye" : "eye-slash"} />
            </BootstrapButton>
            <BootstrapButton
              title={show_masked ? "Hide masked files" : "Show masked files"}
              bsSize="xsmall"
              style={{ flex: "0" }}
              active={!show_masked}
              onClick={() => actions?.setState({ show_masked: !show_masked })}
            >
              <Icon name={"mask"} />
            </BootstrapButton>
          </Space>
        </div>
      </Space>
    );
  }

  function renderItemIcon(
    item: DirectoryListingEntry,
    style: CSS
  ): JSX.Element {
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

  function renderTooltip(
    age: number | null,
    { isdir = false, size = 0 }
  ): JSX.Element {
    return (
      <>
        {age ? (
          <>
            Last modified <TimeAgo date={new Date(age)} />
            <br />
          </>
        ) : undefined}
        {isdir
          ? `Contains ${size} ${plural(size, "item")}`
          : `Size: ${human_readable_size(size)}`}
      </>
    );
  }

  function renderListItem(index: number, item: DirectoryListingEntry) {
    const { mtime, mask = false } = item;
    const age = typeof mtime === "number" ? 1000 * mtime : null;
    return (
      <FileListItem
        item={item}
        onClick={(e) => open(e, index)}
        renderIcon={renderItemIcon}
        itemStyle={fileItemStyle(age ?? 0, mask)}
        onClose={(e: React.MouseEvent, name: string) => {
          e.stopPropagation();
          actions?.close_tab(path_to_file(current_path, name));
        }}
        tooltip={renderTooltip(age, item)}
        selected={index === scrollIdx}
      />
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
        <FileUploadWrapper
          project_id={project_id}
          dest_path={current_path}
          event_handlers={{
            complete: () => actions?.fetch_directory_listing(),
          }}
          config={{ clickable: ".upload-button-flyout" }}
          style={{
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
          }}
          className="smc-vfill"
        >
          {renderListing()}
        </FileUploadWrapper>
      </>
    );
  }

  return renderList();
}
