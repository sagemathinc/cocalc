/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Component that allows a user to select a directory in a project.

- [ ] text box to filter what is shown
*/

import { join } from "path";
import { Button, Card, Checkbox, Input, InputRef, Modal } from "antd";
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, Loading } from "@cocalc/frontend/components";
import { path_split } from "@cocalc/util/misc";
import { alert_message } from "@cocalc/frontend/alerts";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import ShowError from "@cocalc/frontend/components/error";
import useFs from "@cocalc/frontend/project/listing/use-fs";
import useFiles, {
  getCacheId,
} from "@cocalc/frontend/project/listing/use-files";

const NEW_FOLDER = "New Folder";

const ICON_STYLE = {
  cursor: "pointer",
  verticalAlign: "top",
} as const;

interface Props {
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  project_id?: string;
  compute_server_id?: number;
  startingPath?: string;
  isExcluded?: (path: string) => boolean; // grey out directories that return true.  Relative to home directory.
  onSelect?: (path: string) => void; // called when user chooses a directory; only when multi is false.
  onMultiSelect?: (selection: Set<string>) => void; // called whenever selection changes: only when multi true
  onClose?: () => void;
  showHidden?: boolean;
  title?: ReactNode;
  multi?: boolean; // if true enables multiple select
  closable?: boolean;
}

export default function DirectorySelector({
  style,
  bodyStyle,
  project_id,
  compute_server_id,
  startingPath,
  isExcluded,
  onSelect,
  onMultiSelect,
  onClose,
  showHidden: defaultShowHidden,
  title,
  multi,
  closable = true,
}: Props) {
  const frameContext = useFrameContext(); // optionally used to define project_id and startingPath, when in a frame
  if (project_id == null) project_id = frameContext.project_id;
  const fallbackComputeServerId = useTypedRedux(
    { project_id },
    "compute_server_id",
  );
  const computeServerId = compute_server_id ?? fallbackComputeServerId;
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
    [selectedPaths, multi],
  );

  return (
    <Card
      title={
        <>
          {closable && onClose != null && (
            <Icon
              name="times"
              style={{ float: "right", cursor: "pointer", marginTop: "5px" }}
              onClick={onClose}
            />
          )}
          {title ?? "Select Folder"}
        </>
      }
      style={{
        width: "20em",
        backgroundColor: "white",
        ...style,
      }}
      styles={{
        body: {
          maxHeight: "50vh",
          overflow: "scroll",
          whiteSpace: "nowrap",
          ...bodyStyle,
        },
      }}
    >
      <SelectablePath
        project_id={project_id}
        path={""}
        tail={""}
        isSelected={selectedPaths.has("")}
        computeServerId={computeServerId}
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
        showHidden={showHidden}
        project_id={project_id}
        path={""}
        computeServerId={computeServerId}
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
  computeServerId,
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
        const actions = redux.getProjectActions(project_id);
        const fs = actions.fs(computeServerId);
        const { head } = path_split(path);
        await fs.rename(join(head, tail), join(head, editedTail));
        setEditedTail(null);
      } catch (err) {
        alert_message({ type: "error", message: err.toString() });
      }
    },
    [project_id, path],
  );

  let content;
  if (editedTail == null) {
    content = (
      <>
        {tail ? (
          tail
        ) : (
          <>
            <Icon name="home" style={{ marginRight: "5px" }} /> Home Folder
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
    computeServerId,
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
      computeServerId={computeServerId}
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

// Show the directories in path
function Subdirs(props) {
  const {
    computeServerId,
    path,
    project_id,
    showHidden,
    style,
    toggleSelection,
  } = props;
  const fs = useFs({ project_id, computeServerId });
  const { files, error, refresh } = useFiles({
    fs,
    path,
    cacheId: getCacheId({ project_id, compute_server_id: computeServerId }),
  });
  if (error) {
    return <ShowError error={error} setError={refresh} />;
  }
  if (files == null) {
    return <Loading />;
  }

  const w: React.JSX.Element[] = [];
  const base = !path ? "" : path + "/";
  const paths: string[] = [];
  const newPaths: string[] = [];
  for (const name in files) {
    if (!files[name].isdir) continue;
    if (name.startsWith(".") && !showHidden) continue;
    if (name.startsWith(NEW_FOLDER)) {
      newPaths.push(name);
    } else {
      paths.push(name);
    }
  }
  paths.sort();
  newPaths.sort();
  const createProps = {
    project_id,
    path,
    computeServerId,
    toggleSelection,
  };
  w.push(<CreateDirectory key="create1" {...createProps} />);
  for (const name of paths.concat(newPaths)) {
    w.push(<Directory key={name} {...props} path={join(base, name)} />);
  }
  if (w.length > 10) {
    w.push(<CreateDirectory key="create2" {...createProps} />);
  }
  return (
    <div key={path} style={style}>
      {w}
    </div>
  );
}

async function getValidPath(project_id, target, computeServerId) {
  if (await pathExists(project_id, target, computeServerId)) {
    let i: number = 1;
    while (await pathExists(project_id, target + ` (${i})`, computeServerId)) {
      i += 1;
    }
    target += ` (${i})`;
  }
  return target;
}

function CreateDirectory({
  computeServerId,
  project_id,
  path,
  toggleSelection,
}) {
  const [error, setError] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [value, setValue] = useState<string>(NEW_FOLDER);
  const input_ref = useRef<InputRef>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const target = path + (path != "" ? "/" : "") + value;
    (async () => {
      try {
        const path1 = await getValidPath(project_id, target, computeServerId);
        setValue(path_split(path1).tail);
        setTimeout(() => {
          input_ref.current?.select();
        }, 1);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [open]);

  const createFolder = async () => {
    setOpen(false);
    if (!value?.trim()) return;
    try {
      const actions = redux.getProjectActions(project_id);
      const fs = actions.fs(computeServerId);
      await fs.mkdir(join(path, value));
      toggleSelection(value);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setValue(NEW_FOLDER);
    }
  };

  return (
    <div style={{ color: "#666" }} key={"...-create-dir"}>
      <Modal
        title={
          <>
            <Icon name="plus-circle" style={{ marginRight: "5px" }} /> New
            Folder
          </>
        }
        open={open}
        onOk={createFolder}
        onCancel={() => setOpen(false)}
      >
        <Input
          ref={input_ref}
          title="New Folder"
          style={{ marginTop: "30px" }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={() => createFolder()}
          autoFocus
        />
      </Modal>
      <Button
        type="text"
        disabled={open}
        onClick={() => {
          setOpen(true);
        }}
        style={{ margin: "5px 0" }}
      >
        <Icon name="plus-circle" style={{ marginRight: "5px" }} /> New Folder...
      </Button>
      <ShowError error={error} setError={setError} />
    </div>
  );
}

export async function pathExists(
  project_id: string,
  path: string,
  computeServerId?,
): Promise<boolean> {
  const actions = redux.getProjectActions(project_id);
  const fs = actions.fs(computeServerId);
  return await fs.exists(path);
}
