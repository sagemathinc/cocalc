/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that allows a user to select a directory in a project.

- [ ] text box to filter what is shown
*/

import { join } from "path";
import { Button, Card, Checkbox, Input, Tooltip } from "antd";
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Icon, Loading } from "@cocalc/frontend/components";
import { path_split } from "@cocalc/util/misc";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { alert_message } from "@cocalc/frontend/alerts";
import { callback2 } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

const NEW_DIRECTORY = "New Directory";

const ICON_STYLE = {
  cursor: "pointer",
  verticalAlign: "top",
} as const;

interface Props {
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  project_id?: string;
  startingPath?: string;
  isExcluded?: (path: string) => boolean; // grey out directories that return true.  Relative to home directory.
  onSelect?: (path: string) => void; // called when user chooses a directory; only when multi is false.
  onMultiSelect?: (selection: Set<string>) => void; // called whenever selection changes: only when multi true
  onClose?: () => void;
  showHidden?: boolean;
  title?: ReactNode;
  multi?: boolean; // if true enables multiple select
}

export default function DirectorySelector({
  style,
  bodyStyle,
  project_id,
  startingPath,
  isExcluded,
  onSelect,
  onMultiSelect,
  onClose,
  showHidden: defaultShowHidden,
  title,
  multi,
}: Props) {
  const frameContext = useFrameContext(); // optionally used to define project_id and startingPath, when in a frame
  if (project_id == null) project_id = frameContext.project_id;
  const directoryListings = useTypedRedux({ project_id }, "directory_listings");
  const isMountedRef = useIsMountedRef();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const expandedPaths: string[] = [""];
    if (startingPath == null) {
      startingPath = frameContext.path;
    }
    if (startingPath) {
      const v = startingPath.split("/");
      let path = v[0];
      expandedPaths.push(path);
      for (let i = 1; i < v.length; i++) {
        path += "/" + v[i];
        expandedPaths.push(path);
      }
    }
    return new Set(expandedPaths);
  });
  const [showHidden, setShowHidden] = useState<boolean>(!!defaultShowHidden);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback(
    (path: string) => {
      let x;
      if (multi) {
        if (selectedPaths.has(path)) {
          selectedPaths.delete(path);
        } else {
          selectedPaths.add(path);
        }
        x = selectedPaths;
        onMultiSelect?.(x);
      } else {
        if (selectedPaths.has(path)) {
          x = new Set([]);
          onSelect?.("");
        } else {
          x = new Set([path]);
          onSelect?.(path);
        }
      }
      setSelectedPaths(new Set(x));
    },
    [selectedPaths, multi]
  );

  useEffect(() => {
    // Run the loop below every 30s until project_id or expandedPaths changes (or unmount)
    // in which case loop stops.  If not unmount, then get new loops for new values.
    if (!project_id) return;
    const state = { loop: true };
    (async () => {
      while (state.loop && isMountedRef.current) {
        // Component is mounted, so call watch on all expanded paths.
        const listings = redux.getProjectStore(project_id).get_listings();
        for (const path of expandedPaths) {
          listings.watch(path);
        }
        await delay(30000);
      }
    })();
    return () => {
      state.loop = false;
    };
  }, [project_id, expandedPaths]);

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
  return (
    <Card
      title={
        <>
          {onClose != null && (
            <Icon
              name="times"
              style={{ float: "right", cursor: "pointer", marginTop: "5px" }}
              onClick={onClose}
            />
          )}
          {title ?? "Select Directory"}
        </>
      }
      style={{
        width: "20em",
        backgroundColor: "white",
        ...style,
      }}
      bodyStyle={{
        maxHeight: "50vh",
        overflow: "scroll",
        whiteSpace: "nowrap",
        ...bodyStyle,
      }}
    >
      <SelectablePath
        project_id={project_id}
        path={""}
        tail={""}
        isSelected={selectedPaths.has("")}
        toggleSelection={toggleSelection}
        isExcluded={isExcluded?.("")}
        expand={() => {}}
      />
      <Subdirs
        style={{ marginLeft: "2em" }}
        selectedPaths={selectedPaths}
        toggleSelection={toggleSelection}
        isExcluded={isExcluded}
        expandedPaths={expandedPaths}
        setExpandedPaths={setExpandedPaths}
        directoryListings={directoryListings}
        showHidden={showHidden}
        project_id={project_id}
        path={""}
      />
      <Checkbox
        style={{ fontWeight: "400", marginTop: "15px" }}
        checked={showHidden}
        onChange={() => {
          setShowHidden(!showHidden);
        }}
      >
        Show hidden
      </Checkbox>
    </Card>
  );
}

function SelectablePath({
  project_id,
  path,
  tail,
  isSelected,
  toggleSelection,
  isExcluded,
  expand,
}) {
  const [editedTail, setEditedTail] = useState<string | null>(null);

  const renameFolder = useCallback(
    async (editedTail: string) => {
      if (editedTail == tail) {
        return; // no-op
      }
      try {
        await exec({
          command: "mv",
          project_id,
          path: path_split(path).head,
          args: [tail, editedTail],
        });
        setEditedTail(null);
      } catch (err) {
        alert_message({ type: "error", message: err.toString() });
      }
    },
    [project_id, path]
  );

  let content;
  if (editedTail == null) {
    content = (
      <>
        {tail ? (
          tail
        ) : (
          <>
            <Icon name="home" style={{ marginRight: "5px" }} /> Home Directory
          </>
        )}
      </>
    );
  } else {
    content = (
      <Input
        autoFocus
        value={editedTail}
        style={{ width: "100%" }}
        onChange={(e) => setEditedTail(e.target.value)}
        onBlur={() => {
          renameFolder(editedTail);
          setEditedTail(null);
        }}
        onKeyUp={(event) => {
          switch (event.keyCode) {
            case 27:
              setEditedTail(null);
              return;
            case 13:
              renameFolder(editedTail);
              return;
          }
        }}
      />
    );
  }
  let color;
  let backgroundColor: string | undefined = undefined;
  if (isExcluded) {
    color = "gray";
  } else {
    color = "black";
  }

  return (
    <Checkbox
      checked={isSelected}
      disabled={isExcluded}
      style={{ width: "100%", fontWeight: 400 }}
      onChange={() => toggleSelection(path)}
    >
      <span
        style={{
          width: "100%",
          overflowX: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          backgroundColor,
          color,
          borderRadius: "3px",
        }}
        onClick={() => {
          if (isExcluded) {
            expand();
          }
        }}
        onDoubleClick={() => {
          if (isExcluded || !tail) return;
          setEditedTail(tail);
        }}
      >
        {!isExcluded && tail && isSelected && (
          <Button
            type="text"
            style={{ marginLeft: "30px", float: "right" }}
            size="small"
            onClick={() => setEditedTail(tail)}
          >
            <Icon name="pencil" />
          </Button>
        )}
        {content}
      </span>
    </Checkbox>
  );
}

function Directory(props) {
  const {
    project_id,
    path,
    selectedPaths,
    toggleSelection,
    isExcluded,
    expandedPaths,
    setExpandedPaths,
  } = props;
  const isExpanded = expandedPaths.has(path);
  const { tail } = path_split(path);

  let label = (
    <SelectablePath
      project_id={project_id}
      path={path}
      tail={tail}
      isSelected={selectedPaths.has(path)}
      toggleSelection={toggleSelection}
      isExcluded={isExcluded?.(path)}
      expand={() => {
        setExpandedPaths(new Set(expandedPaths.add(path)));
      }}
    />
  );

  if (!isExpanded) {
    return (
      <div key={path}>
        <Button type="text" size="small" style={ICON_STYLE}>
          <Icon
            name="angle-right"
            onClick={() => {
              setExpandedPaths(new Set(expandedPaths.add(path)));
            }}
          />
        </Button>{" "}
        {label}
      </div>
    );
  } else {
    return (
      <div key={path}>
        <div>
          <Button type="text" size="small" style={ICON_STYLE}>
            <Icon
              name="angle-down"
              onClick={() => {
                expandedPaths.delete(path);
                setExpandedPaths(new Set(expandedPaths));
              }}
            />
          </Button>{" "}
          {label}
        </div>
        <div style={{ marginLeft: "1em" }}>
          <Subdirs {...props} />
        </div>
      </div>
    );
  }
}

function Subdirs(props) {
  const { directoryListings, path, project_id, showHidden, style } = props;
  const x = directoryListings?.get(path);
  const v = x?.toJS?.();
  if (v == null) {
    (async () => {
      // Must happen in a different render loop, hence the delay, because
      // fetch can actually update the store in the same render loop.
      await delay(0);
      redux.getProjectActions(project_id)?.fetch_directory_listing({ path });
    })();
    return <Loading />;
  } else {
    const w: JSX.Element[] = [];
    const base = !path ? "" : path + "/";
    const paths: string[] = [];
    const newPaths: string[] = [];
    for (const x of v) {
      if (x?.isdir) {
        if (x.name.startsWith(".") && !showHidden) continue;
        if (x.name.startsWith(NEW_DIRECTORY)) {
          newPaths.push(x.name);
        } else {
          paths.push(x.name);
        }
      }
    }
    paths.sort();
    newPaths.sort();
    for (const name of paths.concat(newPaths)) {
      w.push(<Directory key={name} {...props} path={join(base, name)} />);
    }
    w.push(
      <CreateDirectory
        key="\\createdirectory\\"
        project_id={project_id}
        path={path}
        directoryListings={directoryListings}
      />
    );
    return (
      <div key={path} style={style}>
        {w}
      </div>
    );
  }
}

function CreateDirectory({ project_id, path, directoryListings }) {
  return (
    <div
      style={{ cursor: "pointer", color: "#666" }}
      key={"...-create-dir"}
      onClick={async () => {
        let target = path + (path != "" ? "/" : "") + NEW_DIRECTORY;
        if (await pathExists(project_id, target, directoryListings)) {
          let i: number = 1;
          while (
            await pathExists(project_id, target + ` (${i})`, directoryListings)
          ) {
            i += 1;
          }
          target += ` (${i})`;
        }
        try {
          await exec({
            command: "mkdir",
            args: ["-p", target],
            project_id,
          });
        } catch (err) {
          alert_message({ type: "error", message: err.toString() });
        }
      }}
    >
      <Tooltip
        title="Create a new directory (double click to rename)"
        placement="left"
        mouseEnterDelay={0.9}
      >
        <Button size="small" type="text" style={{ color: "#666" }}>
          <Icon name="plus" style={{ marginRight: "5px" }} /> Create{" "}
          {NEW_DIRECTORY}
        </Button>
      </Tooltip>
    </div>
  );
}

async function pathExists(
  project_id: string,
  path: string,
  directoryListings
): Promise<boolean> {
  const { head, tail } = path_split(path);
  let known = directoryListings?.get(head);
  if (known == null) {
    const actions = redux.getProjectActions(project_id);
    await callback2(actions.fetch_directory_listing.bind(actions), {
      path: head,
    });
  }
  known = directoryListings?.get(head);
  if (known == null) {
    return false;
  }
  for (const x of known) {
    if (x.get("name") == tail) return true;
  }
  return false;
}
