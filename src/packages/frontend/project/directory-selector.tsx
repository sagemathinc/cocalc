/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that allows a user to select a directory in a project.

- [ ] text box to filter what is shown
*/

import { Input } from "antd";
import { CSSProperties, useCallback, useState } from "react";
import { Map as iMap, Set as iSet } from "immutable";
import { Icon, Loading } from "@cocalc/frontend/components";
import { path_split, startswith } from "@cocalc/util/misc";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { alert_message } from "@cocalc/frontend/alerts";
import { callback2 } from "@cocalc/util/async-utils";
import { delay } from "awaiting";
import { redux,   useTypedRedux,
 } from "@cocalc/frontend/app-framework";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

const DEFAULT_STYLE = {
  maxHeight: "250px",
  width: "20em",
  overflow: "scroll",
  backgroundColor: "white",
  padding: "5px",
  border: "1px solid lightgrey",
  borderRadius: "3px",
  whiteSpace: "nowrap",
} as const;

/*
  // reduxProps
  directory_listings?: iMap<string, any>;
*/
// interface State {
//   current_path: string;
//   selected_path?: string;
//   expanded_paths: iSet<string>; // paths that are expanded
//   edit_path: string; // path whose name is being edited
//   edited_name: string;
//   show_hidden: boolean;
// }


interface Props {
  style?: CSSProperties;
  project_id: string;
  startingPath?: string;
  exclusions?: Set<string>; // grey these directories out; should not be available to select.  Relative to home directory.
  onSelect?: Function; // called when user chooses a directory
  onCancel?: Function;
  showHidden?: boolean;
}

export default function DirectorySelector({style, project_id,startingPath, exclusions, onSelect, onCancel, showHidden:defaultShowHidden } : Props) {
  const directoryListings = useTypedRedux(
    { project_id },
    "directory_listings"
  );
  const isMountedRef = useIsMountedRef();
  const [currentPath, setCurrentPath] = useState<string>(startingPath);
  const [expandedPaths, setExpandedPaths] = useState<Set[]>(()=>{
        const expandedPaths: string[] = [""];
        if (currentPath != "") {
          const v = currentPath.split("/");
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
  const [selectedPath, setSelectedPath0] =useState<string|null>(null);
  const setSelectedPath = useCallback((path:string|null) => {
    if (path != null) { onSelect?.(path); }
    setSelectedPath0(path);
  }, [onSelect]);

  useEffect(()=>{
    // Run the loop below every 30s until project_id or expandedPaths changes (or unmount)
    // in which case loop stops.  If not unmount, then get new loops for new values.
    const state = { loop:true};
    (async ()=>{
    while(loop.true && isMountedRef.current) {
      // Component is mounted, so call watch on all expanded paths.
      const listings = redux
        .getProjectStore(project_id)
        .get_listings();
      for (const path of expandedPaths) {
        listings.watch(path);
      }
      await delay(30000);
    }
    })();
    return () => { state.loop = false; }
  }, [project_id, expandedPaths]);





    if (directory_listings == null) {
      (async ()=>{
         await delay(0);
         // Ensure store gets initialized before redux
    // E.g., for copy between projects you make this
    // directory selector before even opening the project.
    redux.getProjectStore(project_id);
      })();
      return <Loading />;
    }
    return (
      <div style={{ ...DEFAULT_STYLE, ...style }}>
            <SelectablePath project_id={project_id} path={""} tail={""}
            isSelected={selectedPath==path}
            setSelectedPath={setSelectedPath}
            isExcluded={exclusions?.has("")}
            />
        <div style={{ marginLeft: "2em" }}>
        <Subdirs   selectedPath={selectedPath} setSelectedPath={setSelectedPath} exclusions={exclusions} expandedPaths={expandedPaths} setExpandedPaths={setExpandedPaths} directoryListings={directoryListings}
          showHidden={showHidden} project_id={project_id} path={path} />
          </div>
              <div
        style={{
          cursor: "pointer",
          borderTop: "1px solid lightgrey",
          marginTop: "5px",
        }}
        onClick={() => {
            setShowHidden(!showHidden)
        }}
      >
        <Icon name={showHidden ? "check-square-o" : "square-o"} />{" "}
        Show hidden directories
      </div>
      </div>
    );
}

function SelectablePath({project_id, path, tail, isSelected, setSelectedPath, isExcluded}) {
  const [editedTail, setEditedTail] = useState<string|null>(null);

  const renameFolder = useCallback(async (editedTail:string)=>{
    if(editedTail == tail) {
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
  }, [project_id, path]);


  let content;
  if (editedTail == null) {
    content = <>{tail ? tail : "Home directory"}</>;
  } else {
    content = (
      <Input
        autoFocus
        value={editedTail}
        style={{width: "100%"}}
        onChange={(e)=>setEditedTail(e.target.value)}
        onBlur={() => {renameFolder(editedTail)}}
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
  } else if (editedTail == null && isSelected) {
    color = "white";
    backgroundColor = "#40a9ff";
  } else {
    color = 'black';
  }

  return (
    <span
      style={{
        cursor: "pointer",
        display: "inline-block",
        width: "100%",
        overflowX: "hidden",
        textOverflow: "ellipsis",
        padding: "0 5px",
        whiteSpace: "nowrap",
        backgroundColor,
        color,
      }}
      onClick={() => {
        if (isExcluded) return;
        setSelectedPath(path);
      }}
      onDoubleClick={() => {
        if (isExcluded || !tail) return;
        setEditedTail(tail);
      }}
    >
      {content}
    </span>
  );
}

function Directory(props) {
  const {path, selectedPath, setSelectedPath, exclusions, expandedPaths, setExpandedPaths, directoryListings} = props;
  const isExpanded = expandedPaths.has(path);
    const { tail } = path_split(path);
    if (!isExpanded) {
      return (
        <div key={path}>
          <Icon
            style={{ cursor: "pointer", verticalAlign: "top" }}
            name="angle-right"
            onClick={() => {
              setExpandedPaths(new Set(expandedPaths.add(path)));
            }}
          />{" "}
          <SelectablePath project_id={project_id} path={path} tail={tail}
            isSelected={selectedPath==path}
            setSelectedPath={setSelectedPath}
            isExcluded={exclusions?.has(path)}
            />
        </div>
      );
    } else {
      return (
        <div key={path}>
          <div>
            <Icon
              style={{ cursor: "pointer", verticalAlign: "top" }}
              name="angle-down"
            onClick={() => {
              setExpandedPaths(new Set(expandedPaths.remove(path)));
            }}
            />{" "}
                      <SelectablePath project_id={project_id}
                        path={path} tail={tail}
            isSelected={selectedPath==path}
            setSelectedPath={setSelectedPath}
            isExcluded={exclusions?.has(path)}
            />
          </div>
          <div style={{ marginLeft: "2em" }}>
            <Subdirs {...props} />
        </div>
      );
    }
}

function Subdirs(props) {
    const {directoryListings, path, project_id, showHidden} = props;
    const x = directoryListings?.get(path);
    const v = x?.toJS?.();
    if (v == null) {
      (async ()=>{
        // Must happen in a different render loop, hence the delay, because
        // fetch can actually update the store in the same render loop.
        await delay(0);
        redux.getProjectActions(project_id)?.fetch_directory_listing({ path });
      })();
      return <Loading />;
    } else {
      const w: JSX.Element[] = [];
      const base = !path ? "" : path + "/";
      for (const x of v) {
        if (x?.isdir) {
          if (x.name.startsWith(".") && !showHidden) continue;
          w.push(<Directory {...props} path={base+x.name}/>);
        }
      }
      w.push(<CreateDirectory project_id={project_id} path={path} directoryListings={directoryListings} />);
      return <div key={path}>{w}</div>;
    }
}

function CreateDirectory({project_id, path, directoryListings}) {
      return (
      <div
        style={{ cursor: "pointer" }}
        key={"...-create-dir"}
        onClick={async () => {
          let target = path + (path != "" ? "/" : "") + "New directory";
          if (await pathExists(project_id, target, directoryListings)) {
            let i: number = 1;
            while (await pathExists(project_id, target + ` (${i})`, directoryListings)) {
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
        <Icon style={{ verticalAlign: "top" }} name="plus" /> New directory
      </div>
    );
}

async function pathExists(project_id:string, path: string, directoryListings): Promise<boolean> {
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
