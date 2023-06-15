/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CaretRightOutlined } from "@ant-design/icons";
import {
  Button,
  Collapse,
  Input,
  InputRef,
  Popover,
  Radio,
  Space,
  Tooltip,
} from "antd";
import { delay } from "awaiting";
import { List } from "immutable";
import { throttle } from "lodash";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  ProjectActions,
  React,
  ReactDOM,
  TypedMap,
  redux,
  useActions,
  useCallback,
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
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { Terminal } from "@cocalc/frontend/frame-editors/terminal-editor/connected-terminal";
import { background_color } from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
} from "@cocalc/frontend/project/explorer/action-bar";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/project/websocket/listings";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import track from "@cocalc/frontend/user-tracking";
import {
  human_readable_size,
  path_split,
  path_to_file,
  plural,
  search_match,
  search_split,
  should_open_in_foreground,
  strictMod,
  tab_to_path,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { useProjectState } from "../project-state-hook";
import { FileListItem, fileItemStyle } from "./components";

type ActiveFileSort = TypedMap<{
  column_name: string;
  is_descending: boolean;
}>;

export function FilesFlyout({ project_id }): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const refInput = useRef<InputRef>(null);
  const actions: ProjectActions | undefined = useActions({ project_id });
  const project_state = useProjectState(project_id);
  const projectIsRunning = project_state?.get("state") === "running";
  const current_path = useTypedRedux({ project_id }, "current_path");
  const directoryListings = useTypedRedux({ project_id }, "directory_listings");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const activeFileSort: ActiveFileSort = useTypedRedux(
    { project_id },
    "active_file_sort"
  );
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const show_masked = useTypedRedux({ project_id }, "show_masked");
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const [search, setSearch] = useState<string>("");
  const [prevSelected, setPrevSelected] = useState<number | null>(null);
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scollIdxHide, setScrollIdxHide] = useState<boolean>(false);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const disableUploads = student_project_functionality.disableUploads ?? false;
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::files::${current_path}`,
  });
  const uploadClassName = `upload-button-flyout-${project_id}`;

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

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
      if (activePath === fullPath) {
        file.isactive = true;
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

  // reset selection if path changes
  useEffect(() => {
    actions?.set_all_files_unchecked();
    setPrevSelected(null);
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
      const fn = directoryFiles[index].name;
      if (checked_files.includes(fn)) {
        actions?.set_file_list_unchecked(List([fn]));
      }
    }
  }

  function toggleSelected(index: number, fn: string) {
    if (checked_files.includes(fn)) {
      actions?.set_file_list_unchecked(List([fn]));
    } else {
      actions?.set_file_list_checked([fn]);
      setPrevSelected(index);
    }
  }

  function handleFileClick(e: React.MouseEvent, index: number) {
    // deselect text if any
    window.getSelection()?.removeAllRanges();
    const file = directoryFiles[index];

    // doubleclick straight to open file
    if (e.detail === 2) {
      open(e, index);
      return;
    }

    // if opened, just switch to the tab...
    if (file.isopen) {
      // ... unless active, then select/deselect it
      if (file.isactive) {
        toggleSelected(index, file.name);
      } else {
        open(e, index);
      }
      return;
    }

    // shift-click selects whole range from last selected (if not null) to current index
    if (e.shiftKey && prevSelected != null) {
      const start = Math.min(prevSelected, index);
      const end = Math.max(prevSelected, index);
      const add = !checked_files.includes(directoryFiles[index].name);
      let fileNames: string[] = [];
      for (let i = start; i <= end; i++) {
        const fn = directoryFiles[i].name;
        fileNames.push(fn);
      }
      if (add) {
        actions?.set_file_list_checked(fileNames);
      } else {
        actions?.set_file_list_unchecked(List(fileNames));
      }
      return;
    }

    // base case: select/de-select single file with a single click
    toggleSelected(index, file.name);
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

    // if esc key is pressed, clear search and reset
    else if (e.key === "Escape") {
      setSearch("");
    }
  }

  function renderItemIcon(
    item: DirectoryListingEntry,
    style: CSS
  ): JSX.Element {
    const iconName = item.isdir
      ? "folder-open"
      : file_options(item.name)?.icon ?? "file";
    return <Icon name={iconName} style={style} />;
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
    // either select by scrolling (and only scrolling!) or by clicks
    const isSelected =
      scrollIdx != null
        ? !scollIdxHide && index === scrollIdx
        : checked_files.includes(directoryFiles[index].name);
    return (
      <FileListItem
        item={item}
        onClick={(e) => handleFileClick(e, index)}
        renderIcon={renderItemIcon}
        itemStyle={fileItemStyle(age ?? 0, mask)}
        onClose={(e: React.MouseEvent, name: string) => {
          e.stopPropagation();
          actions?.close_tab(path_to_file(current_path, name));
        }}
        onOpen={(e: React.MouseEvent) => {
          e.stopPropagation();
          open(e, index);
        }}
        tooltip={renderTooltip(age, item)}
        selected={isSelected}
      />
    );
  }

  function renderListing(): JSX.Element {
    const files = directoryListings.get(current_path);
    if (files == null) return <Loading />;

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

  function wrapDropzone(children: JSX.Element): JSX.Element {
    if (disableUploads) return children;
    return (
      <FileUploadWrapper
        project_id={project_id}
        dest_path={current_path}
        event_handlers={{
          complete: () => actions?.fetch_directory_listing(),
        }}
        config={{ clickable: `.${uploadClassName}` }}
        className="smc-vfill"
      >
        {children}
      </FileUploadWrapper>
    );
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

  function renderHeader() {
    return (
      <Space
        direction="vertical"
        style={{
          flex: "0 0 auto",
          paddingBottom: "10px",
          paddingRight: "5px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
        }}
      >
        {wrapDropzone(
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
              <Button
                className={uploadClassName}
                size="small"
                disabled={!projectIsRunning || disableUploads}
              >
                <Icon name={"upload"} />
              </Button>
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
        )}
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
            onFocus={() => setScrollIdxHide(false)}
            onBlur={() => setScrollIdxHide(true)}
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

  function renderBottom() {
    return (
      <FilesBottom
        project_id={project_id}
        checked_files={checked_files}
        directoryFiles={directoryFiles}
        current_path={current_path}
      />
    );
  }

  return (
    <>
      {renderHeader()}
      {disableUploads ? (
        renderListing()
      ) : (
        <FileUploadWrapper
          project_id={project_id}
          dest_path={current_path}
          event_handlers={{
            complete: () => actions?.fetch_directory_listing(),
          }}
          style={{
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
          }}
          className="smc-vfill"
        >
          {renderListing()}
        </FileUploadWrapper>
      )}
      {renderBottom()}
    </>
  );
}

function FilesBottom({
  project_id,
  checked_files,
  directoryFiles,
  current_path,
}) {
  const actions = useActions({ project_id });
  const n = checked_files.size;
  const [activeKey, setActiveKey] = useState<string[]>([]);

  useEffect(() => {
    // if any selected, open "selectd" – otherwise close
    if (checked_files.size > 0) {
      setActiveKey(["selected", ...activeKey]);
    } else {
      setActiveKey(activeKey.filter((x) => x !== "selected"));
    }
  }, [checked_files]);

  function renderTerminal() {
    return (
      <TerminalFlyout
        project_id={project_id}
        id={`flyout::${project_id}::${current_path}`}
        path={current_path}
        font_size={10}
        resize={0}
        is_visible={activeKey.includes("terminal")}
      />
    );
  }

  function renderButtons(names) {
    const filename = path_split(checked_files.first()).tail;
    return (
      <Space wrap>
        {names.map((name) => {
          const disabled =
            [
              "move",
              "compress",
              "rename",
              "delete",
              "share",
              "duplicate",
            ].includes(name) &&
            (current_path?.startsWith(".snapshots") ?? false);

          const { name: actionName, icon, hideFlyout } = FILE_ACTIONS[name];
          if (hideFlyout) return;
          return (
            <Popover key={name} content={`${actionName}...`}>
              <Button
                size="small"
                key={name}
                disabled={disabled}
                onClick={() => {
                  actions?.show_file_action_panel({
                    path: filename,
                    action: name,
                  });
                }}
              >
                <Icon name={icon} />
              </Button>
            </Popover>
          );
        })}
      </Space>
    );
  }

  function renderSelected() {
    if (checked_files.size === 0) {
      return <div>No files selected.</div>;
    } else if (checked_files.size === 1) {
      if (
        directoryFiles.filter((f) => f.name === checked_files.first()).isdir
      ) {
        return renderButtons(ACTION_BUTTONS_DIR);
      } else {
        return renderButtons(ACTION_BUTTONS_FILE);
      }
    } else if (checked_files.size > 1) {
      return renderButtons(ACTION_BUTTONS_MULTI);
    }
  }

  const style: CSS = {
    background: COLORS.GRAY_LL,
    borderRadius: 0,
    border: "none",
  };

  return (
    <Collapse
      bordered={false}
      activeKey={activeKey}
      onChange={(key) => Array.isArray(key) && setActiveKey(key)}
      size="small"
      expandIcon={({ isActive }) => (
        <CaretRightOutlined rotate={isActive ? 90 : 0} />
      )}
      destroyInactivePanel={true}
      style={{
        ...style,
        flex: "0 0 auto",
        borderTop: FIX_BORDER,
      }}
    >
      {n > 0 ? (
        <Collapse.Panel
        className="cc-project-flyout-files-panel"
          header={<>{n} selected</>}
          key="selected"
          style={style}
          extra={
            <Button
              size="small"
              disabled={checked_files.size === 0}
              onClick={(e) => {
                e.stopPropagation();
                actions?.set_all_files_unchecked();
              }}
            >
              Deselect all
            </Button>
          }
        >
          {renderSelected()}
        </Collapse.Panel>
      ) : undefined}
      <Collapse.Panel className="cc-project-flyout-files-panel" header="Terminal" key="terminal" style={style}>
        {renderTerminal()}
      </Collapse.Panel>
    </Collapse>
  );
}

// This is modeled after frame-editors/terminal-editor/terminal.tsx
function TerminalFlyout({
  project_id,
  id,
  font_size,
  resize,
  is_visible,
  path,
}) {
  const terminal = useTypedRedux("account", "terminal");
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const terminalDOMRef = useRef<any>(null);
  const isMountedRef = useIsMountedRef();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  function delete_terminal(): void {
    if (terminalRef.current == null) return; // already deleted or never created
    terminalRef.current.element?.remove();
    terminalRef.current.is_visible = false;
    // Ignore size for this terminal.
    terminalRef.current.conn_write({ cmd: "size", rows: 0, cols: 0 });
    terminalRef.current.close();
    terminalRef.current = undefined;
  }

  function get_terminal(
    id: string,
    path: string,
    parent: HTMLElement
  ): Terminal {
    const ourActions = {
      project_id,
      path,
      get_term_env() {
        return {};
      },
      flag_file_activity() {},
      set_title(_id, _title) {},
      set_connection_status(_id, _status) {},
      decrease_font_size() {},
      increase_font_size() {},
      set_terminal_cwd(_id, _payload) {},
    };
    const newTerminal = new Terminal(
      ourActions as any,
      0,
      id,
      parent,
      "bash",
      []
    );
    newTerminal.connect();
    return newTerminal;
  }

  function init_terminal(): void {
    if (!is_visible) return;
    const node: any = ReactDOM.findDOMNode(terminalDOMRef.current);
    if (node == null) {
      // happens, e.g., when terminals are disabled.
      return;
    }
    try {
      terminalRef.current = get_terminal(id, path, node);
    } catch (err) {
      return; // not yet ready -- might be ok; will try again.
    }
    if (terminalRef.current == null) return; // should be impossible.
    terminalRef.current.is_visible = true;
    set_font_size();
    measure_size();
    terminalRef.current.focus();
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable ..
    // Well, this context menu is still silly. Always disable it.
    $(node).on("contextmenu", function () {
      return false;
    });

    terminalRef.current.scroll_to_bottom();
  }

  useEffect(() => {
    terminalRef.current?.focus();
    return delete_terminal; // clean up on unmount
  }, []);

  useEffect(() => {
    if (terminalRef.current != null) {
      terminalRef.current.is_visible = is_visible;
    }
    // We *only* init the terminal if it is visible
    // or switches to being visible and was not initialized.
    // See https://github.com/sagemathinc/cocalc/issues/5133
    if (terminalRef.current != null || !is_visible) return;
    init_terminal();
  }, [is_visible]);

  useEffect(() => {
    // yes, this can change!! -- see https://github.com/sagemathinc/cocalc/issues/3819
    if (terminalRef.current == null) return;
    delete_terminal();
    init_terminal();
  }, [id]);

  useEffect(() => {
    measure_size();
  }, [resize]);

  const set_font_size = useCallback(
    throttle(() => {
      if (terminalRef.current == null || !isMountedRef.current) {
        return;
      }
      if (terminalRef.current.getOption("fontSize") !== font_size) {
        terminalRef.current.set_font_size(font_size);
        measure_size();
      }
    }, 200),
    []
  );

  useEffect(set_font_size, [font_size]);

  function measure_size(): void {
    if (isMountedRef.current) {
      terminalRef.current?.measure_size();
    }
  }

  if (student_project_functionality.disableTerminals) {
    return (
      <b style={{ margin: "auto", fontSize: "14pt", padding: "15px" }}>
        Terminals are currently disabled in this project. Please contact your
        instructor if you have questions.
      </b>
    );
  }

  const backgroundColor = background_color(terminal.get("color_scheme"));

  return (
    <div
      style={{
        flex: "1 0 auto",
        display: "flex",
        flexDirection: "column",
        backgroundColor,
        padding: "0",
      }}
      onClick={() => {
        // Focus on click, since otherwise, clicking right outside term defocuses,
        // which is confusing.
        terminalRef.current?.focus();
      }}
    >
      <div
        style={{
          flex: "1 0 auto",
          background: COLORS.GRAY_LLL,
          height: "200px",
        }}
        className={"cocalc-xtermjs"}
        ref={terminalDOMRef}
      />
    </div>
  );
}
