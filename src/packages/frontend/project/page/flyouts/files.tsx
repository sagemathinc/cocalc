/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, InputRef } from "antd";
import { delay } from "awaiting";
import { List, Map } from "immutable";
import { debounce, fromPairs } from "lodash";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import {
  React,
  TypedMap,
  redux,
  useEffect,
  useIsMountedRef,
  useLayoutEffect,
  useMemo,
  usePrevious,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading, TimeAgo } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import {
  DirectoryListing,
  DirectoryListingEntry,
  FileMap,
} from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/conat/listings";
import { mutate_data_to_compute_public_files } from "@cocalc/frontend/project_store";
import track from "@cocalc/frontend/user-tracking";
import {
  capitalize,
  copy_without,
  human_readable_size,
  path_split,
  path_to_file,
  search_match,
  search_split,
  separate_file_extension,
  tab_to_path,
  unreachable,
} from "@cocalc/util/misc";
import {
  FLYOUT_EXTRA2_WIDTH_PX,
  FLYOUT_EXTRA_WIDTH_PX,
  FLYOUT_PADDING,
} from "./consts";
import { FileListItem } from "./file-list-item";
import { FilesBottom } from "./files-bottom";
import { FilesHeader } from "./files-header";
import { fileItemStyle } from "./utils";

type PartialClickEvent = Pick<
  React.MouseEvent | React.KeyboardEvent,
  "detail" | "shiftKey" | "ctrlKey" | "stopPropagation"
>;

const EMPTY_LISTING: [DirectoryListing, FileMap, null, boolean] = [
  [],
  {},
  null,
  true,
];

export type ActiveFileSort = TypedMap<{
  column_name: string;
  is_descending: boolean;
}>;

// modeled after ProjectStore::stripped_public_paths
function useStrippedPublicPaths(project_id: string) {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  return useMemo(() => {
    if (public_paths == null) return List();
    return public_paths
      .valueSeq()
      .map((public_path: any) =>
        copy_without(public_path.toJS(), ["id", "project_id"]),
      );
  }, [public_paths]);
}

export function FilesFlyout({
  flyoutWidth,
}: {
  flyoutWidth: number;
}): JSX.Element {
  const {
    isRunning: projectIsRunning,
    project_id,
    actions,
  } = useProjectContext();
  const isMountedRef = useIsMountedRef();
  const rootRef = useRef<HTMLDivElement>(null as any);
  const refInput = useRef<InputRef>(null as any);
  const [rootHeightPx, setRootHeightPx] = useState<number>(0);
  const [showCheckboxIndex, setShowCheckboxIndex] = useState<number | null>(
    null,
  );
  const current_path = useTypedRedux({ project_id }, "current_path");
  const strippedPublicPaths = useStrippedPublicPaths(project_id);
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  const directoryListings: Map<
    string,
    TypedMap<DirectoryListing> | null
  > | null = useTypedRedux({ project_id }, "directory_listings")?.get(
    compute_server_id,
  );
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const activeFileSort: ActiveFileSort = useTypedRedux(
    { project_id },
    "active_file_sort",
  );
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const show_masked = useTypedRedux({ project_id }, "show_masked");
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  // mainly controls what a single click does, plus additional UI elements
  const [mode, setMode] = useState<"open" | "select">("open");
  const [prevSelected, setPrevSelected] = useState<number | null>(null);
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scrollIdxHide, setScrollIdxHide] = useState<boolean>(false);
  const [selectionOnMouseDown, setSelectionOnMouseDown] = useState<string>("");
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const disableUploads = student_project_functionality.disableUploads ?? false;
  const virtuosoRef = useRef<VirtuosoHandle>(null as any);
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::files::${current_path}`,
  });
  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  // copied roughly from directory-selector.tsx
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

  // selecting files switches over to "select" mode or back to "open"
  useEffect(() => {
    if (mode === "open" && checked_files.size > 0) {
      setMode("select");
    }
    if (mode === "select" && checked_files.size === 0) {
      setMode("open");
    }
  }, [checked_files]);

  // active file: current editor is the file in the listing
  // empty: either no files, or just the ".." for the parent dir
  const [directoryFiles, fileMap, activeFile, isEmpty] = useMemo((): [
    DirectoryListing,
    FileMap,
    DirectoryListingEntry | null,
    boolean,
  ] => {
    if (directoryListings == null) return EMPTY_LISTING;
    const filesStore = directoryListings.get(current_path);
    if (filesStore == null) return EMPTY_LISTING;

    // TODO this is an error, process it
    if (typeof filesStore === "string") return EMPTY_LISTING;

    const files: DirectoryListing | null = filesStore.toJS?.();
    if (files == null) return EMPTY_LISTING;
    let activeFile: DirectoryListingEntry | null = null;
    compute_file_masks(files);
    const searchWords = search_split(file_search.trim().toLowerCase());

    const procFiles = files
      .filter((file: DirectoryListingEntry) => {
        file.name ??= ""; // sanitization

        if (file_search === "") return true;
        const fName = file.name.toLowerCase();
        return (
          search_match(fName, searchWords) ||
          ((file.isdir ?? false) && search_match(`${fName}/`, searchWords))
        );
      })
      .filter(
        (file: DirectoryListingEntry) => show_masked || !(file.mask === true),
      )
      .filter(
        (file: DirectoryListingEntry) => hidden || !file.name.startsWith("."),
      );

    // this shares the logic with what's in project_store.js
    mutate_data_to_compute_public_files(
      {
        listing: procFiles,
        public: {},
      },
      strippedPublicPaths,
      current_path,
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
        activeFile = file;
      }
    }

    if (activeFileSort.get("is_descending")) {
      procFiles.reverse(); // inplace op
    }

    const isEmpty = procFiles.length === 0;

    // the ".." dir does not change the isEmpty state
    // hide ".." if there is a search -- https://github.com/sagemathinc/cocalc/issues/6877
    if (file_search === "" && current_path != "") {
      procFiles.unshift({
        name: "..",
        isdir: true,
      });
    }

    // map each filename to it's entry in the directory listing
    const fileMap = fromPairs(procFiles.map((file) => [file.name, file]));

    return [procFiles, fileMap, activeFile, isEmpty];
  }, [
    directoryListings,
    activeFileSort,
    hidden,
    file_search,
    openFiles,
    show_masked,
    current_path,
    strippedPublicPaths,
  ]);

  const prev_current_path = usePrevious(current_path);

  useEffect(() => {
    // reset prev selection if path changes
    setPrevSelected(null);

    // if the current_path changes and there was a previous one,
    // we reset the checked files as well. This should probably be somewhere in the actions, though.
    // The edge case is when more than one editor in different directories is open,
    // and you switch between the two. Checked files are not reset in that case.
    if (prev_current_path != null && prev_current_path !== current_path) {
      actions?.set_all_files_unchecked();
    }

    // if we change directory *and* use the keyboard, we re-focus the input
    if (scrollIdx != null) {
      refInput.current?.focus();
    }
    setScrollIdx(null);
  }, [current_path]);

  useEffect(() => {
    setShowCheckboxIndex(null);
  }, [directoryListings, current_path]);

  const triggerRootResize = debounce(
    () => setRootHeightPx(rootRef.current?.clientHeight ?? 0),
    50,
    { leading: false, trailing: true },
  );

  // observe the root element's height
  useLayoutEffect(() => {
    if (rootRef.current == null) return;
    const observer = new ResizeObserver(triggerRootResize);
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const [showExtra, showExtra2] = useMemo(() => {
    return [
      flyoutWidth > FLYOUT_EXTRA_WIDTH_PX,
      flyoutWidth > FLYOUT_EXTRA2_WIDTH_PX,
    ];
  }, [flyoutWidth]);

  const setSearchState = (val: string) => {
    actions?.set_file_search(val);
  };

  const handleSearchChange = (val: string) => {
    setScrollIdx(null);
    setSearchState(val);
  };

  // incoming search state change
  useEffect(() => {
    setScrollIdx(null);
  }, [file_search]);

  // *** END HOOKS ***

  function getFile(name: string): DirectoryListingEntry | undefined {
    const basename = path_split(name).tail;
    return fileMap[basename];
  }

  if (directoryListings == null) {
    (async () => {
      await delay(0);
      // Ensure store gets initialized before redux
      // E.g., for copy between projects you make this
      // directory selector before even opening the project.
      redux.getProjectStore(project_id);
    })();
  }

  if (directoryListings?.get(current_path) == null) {
    (async () => {
      // Must happen in a different render loop, hence the delay, because
      // fetch can actually update the store in the same render loop.
      await delay(0);
      redux
        .getProjectActions(project_id)
        ?.fetch_directory_listing({ path: current_path });
    })();
  }

  function open(
    e: PartialClickEvent,
    index: number,
    skip = false, // to exclude directories
  ) {
    e?.stopPropagation();
    const file = directoryFiles[index];
    if (file == null) return;

    if (!skip) {
      const fullPath = path_to_file(current_path, file.name);

      if (file.isdir) {
        // true: change history, false: do not show "files" page
        actions?.open_directory(fullPath, true, false);
        setSearchState("");
      } else {
        const foreground = should_open_in_foreground(e as React.MouseEvent);
        track("open-file", {
          project_id,
          path: fullPath,
          how: "click-on-listing-flyout",
        });
        actions?.open_file({
          path: fullPath,
          foreground,
          explicit: true,
        });
      }
    }

    const fn = file.name;
    if (checked_files.includes(fn)) {
      actions?.set_file_list_unchecked(List([fn]));
    }
  }

  function toggleSelected(index: number, fn: string, nextState?: boolean) {
    // never select "..", only calls for trouble
    if (fn === "..") return;
    fn = path_to_file(current_path, fn);
    window.getSelection()?.removeAllRanges();
    if (nextState != null ? !nextState : checked_files.includes(fn)) {
      // deselects the file
      actions?.set_file_list_unchecked(List([fn]));
      if (checked_files.size <= 1) {
        setPrevSelected(null);
      } else {
        setPrevSelected(index);
      }
    } else {
      // selects the file
      actions?.set_file_list_checked([fn]);
      setPrevSelected(index);
    }
  }

  function handleFileClick(e: PartialClickEvent | undefined, index: number) {
    e ??= {
      detail: 1, // single click
      shiftKey: false,
      ctrlKey: false,
      stopPropagation: () => {},
    };
    // "hack" from explorer/file-listing/file-row.tsx to avoid a click,
    // if the user selects the filename -- ignore double clicks, though.
    if (
      e?.detail !== 2 &&
      (window.getSelection()?.toString() ?? "") !== selectionOnMouseDown
    ) {
      return;
    }

    // deselect text if any
    window.getSelection()?.removeAllRanges();
    const file = directoryFiles[index];

    // doubleclick straight to open file
    if (e.detail === 2) {
      setPrevSelected(index);
      open(e, index);
      return;
    }

    // similar, if in open mode and already opened, just switch to it as well
    if (mode === "open" && file.isopen && !e.shiftKey && !e.ctrlKey) {
      setPrevSelected(index);
      open(e, index);
      return;
    }

    // shift-click selects whole range from last selected (if not null) to current index
    if (e.shiftKey) {
      if (prevSelected != null) {
        const start = Math.min(prevSelected, index);
        const end = Math.max(prevSelected, index);
        const add = !checked_files.includes(
          path_to_file(current_path, directoryFiles[index].name),
        );
        let fileNames: string[] = [];
        for (let i = start; i <= end; i++) {
          const fn = directoryFiles[i].name;
          if (fn === "..") continue; // don't select parent dir, just calls for trouble
          fileNames.push(path_to_file(current_path, fn));
        }
        if (add) {
          actions?.set_file_list_checked(fileNames);
        } else {
          actions?.set_file_list_unchecked(List(fileNames));
        }
        return;
      } else {
        toggleSelected(index, file.name);
        setPrevSelected(index);
        return;
      }
    }

    switch (mode) {
      case "select":
        toggleSelected(index, file.name);
        break;

      case "open":
        if (e.shiftKey || e.ctrlKey) {
          // Shift case: no prevSelected, otherwise see above
          toggleSelected(index, file.name);
        } else {
          setPrevSelected(index);
          open(e, index);
        }
        break;

      default:
        unreachable(mode);
    }
  }

  function showFileSharingDialog(file?: { name: string }) {
    if (!file) return;
    actions?.set_active_tab("files");
    const fullPath = path_to_file(current_path, file.name);
    // only select the published file, same logic as in file-row.tsx
    actions?.set_all_files_unchecked();
    actions?.set_file_list_checked([fullPath]);
    actions?.set_file_action("share");
  }

  function renderTimeAgo(item: DirectoryListingEntry) {
    const { mtime, isopen = false } = item;
    if (typeof mtime === "number") {
      return (
        <TimeAgo
          date={1000 * mtime}
          // don't popup the toggle if you just clicked to open the file
          click_to_toggle={isopen}
        />
      );
    }
  }

  function renderListItemExtra(item: DirectoryListingEntry) {
    if (!showExtra) return null;
    const col = activeFileSort.get("column_name");
    switch (col) {
      case "time":
        return renderTimeAgo(item);
      case "type":
        if (item.isdir) return "Folder";
        const { ext } = separate_file_extension(item.name);
        return capitalize(file_options(item.name).name) || ext;
      case "name":
      case "size":
        return human_readable_size(item.size, true);
      default:
        return null;
    }
  }

  function renderListItemExtra2(item: DirectoryListingEntry) {
    if (!showExtra2) return;
    const col = activeFileSort.get("column_name");
    switch (col) {
      case "time":
      case "type":
        return human_readable_size(item.size, true);
      case "size":
      case "name":
        return renderTimeAgo(item);
      default:
        return null;
    }
  }

  function renderListItem(index: number, item: DirectoryListingEntry) {
    const { mtime, mask = false } = item;
    const age = typeof mtime === "number" ? 1000 * mtime : null;
    // either select by scrolling (and only scrolling!) or by clicks
    const isSelected =
      scrollIdx != null
        ? !scrollIdxHide && index === scrollIdx
        : checked_files.includes(
            path_to_file(current_path, directoryFiles[index].name),
          );
    return (
      <FileListItem
        mode="files"
        item={item}
        index={index}
        extra={renderListItemExtra(item)}
        extra2={renderListItemExtra2(item)}
        onClick={(e) => handleFileClick(e, index)}
        onMouseDown={(e: React.MouseEvent, name: string) => {
          setSelectionOnMouseDown(window.getSelection()?.toString() ?? "");
          if (e.button === 1) {
            // middle mouse click
            actions?.close_tab(path_to_file(current_path, name));
          }
        }}
        itemStyle={fileItemStyle(age ?? 0, mask)}
        onPublic={() => showFileSharingDialog(directoryFiles[index])}
        selected={isSelected}
        showCheckbox={
          mode === "select" ||
          checked_files?.size > 0 ||
          showCheckboxIndex === index
        }
        setShowCheckboxIndex={setShowCheckboxIndex}
        onChecked={(nextState: boolean) => {
          toggleSelected(index, item.name, nextState);
        }}
        checked_files={checked_files}
      />
    );
  }

  function renderLoadingOrStartProject(): JSX.Element {
    if (projectIsRunning) {
      return <Loading theme="medium" transparent />;
    } else {
      return (
        <Alert
          type="warning"
          banner
          showIcon={false}
          style={{ padding: FLYOUT_PADDING, margin: 0 }}
          description={
            <>
              In order to see the files in this directory, you have to{" "}
              <a
                onClick={() => {
                  redux.getActions("projects").start_project(project_id);
                }}
              >
                start this project
              </a>
              .
            </>
          }
        />
      );
    }
  }

  function renderListing(): JSX.Element {
    const files = directoryListings?.get(current_path);
    if (files == null) {
      return renderLoadingOrStartProject();
    }

    return (
      <Virtuoso
        ref={virtuosoRef}
        style={{}}
        increaseViewportBy={10}
        onMouseLeave={() => setShowCheckboxIndex(null)}
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

  function clearAllSelections(switchMode) {
    if (switchMode) setMode("open");
    setPrevSelected(null);
    actions?.set_all_files_unchecked();
  }

  function selectAllFiles() {
    actions?.set_file_list_checked(
      directoryFiles
        .filter((f) => f.name !== "..")
        .map((f) => path_to_file(current_path, f.name)),
    );
  }

  return (
    <div
      ref={rootRef}
      style={{ flex: "1 0 auto", flexDirection: "column", display: "flex" }}
    >
      <FilesHeader
        activeFile={activeFile}
        getFile={getFile}
        activeFileSort={activeFileSort}
        checked_files={checked_files}
        directoryFiles={directoryFiles}
        disableUploads={disableUploads}
        handleSearchChange={handleSearchChange}
        isEmpty={isEmpty}
        open={open}
        refInput={refInput}
        scrollIdx={scrollIdx}
        setScrollIdx={setScrollIdx}
        setScrollIdxHide={setScrollIdxHide}
        setSearchState={setSearchState}
        showFileSharingDialog={showFileSharingDialog}
        virtuosoRef={virtuosoRef}
        modeState={[mode, setMode]}
        clearAllSelections={clearAllSelections}
        selectAllFiles={selectAllFiles}
      />
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
      <FilesBottom
        project_id={project_id}
        checked_files={checked_files}
        activeFile={activeFile}
        directoryFiles={directoryFiles}
        modeState={[mode, setMode]}
        projectIsRunning={projectIsRunning}
        rootHeightPx={rootHeightPx}
        clearAllSelections={clearAllSelections}
        selectAllFiles={selectAllFiles}
        open={open}
        showFileSharingDialog={showFileSharingDialog}
        getFile={getFile}
      />
    </div>
  );
}
