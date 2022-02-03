/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Switch, Table } from "antd";
const { Column } = Table;
import { ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import {
  redux,
  useEditorRedux,
  useEffect,
  useTypedRedux,
  CSS,
  useState,
  useRef,
} from "@cocalc/frontend/app-framework";
import { Loading, TimeAgo } from "@cocalc/frontend/components";
import { Button } from "antd";
import { Actions, State } from "./actions";
import { useFileListingWatching } from "./useFileListingWatching";
import useProjectRunning from "./useProjectRunning";
import { COLORS } from "@cocalc/util/theme";
import { StarFilled, StarOutlined } from "@ant-design/icons";
import useListingsData from "./useListingsData";
import { FileEntry } from "./types";
import useTableHeight from "./useTableHeight";
import { times } from "underscore";

const ROOT_STYLE: CSS = {
  overflowY: "auto",
};

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size?: number;
  name: string;
  resize: number;
}

const Listing: React.FC<Props> = (props: Props) => {
  const { actions, path = "", project_id, font_size, resize } = props;

  const tableRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const [debugMe, setDebugMe] = useState<boolean>(false);
  const [showHidden, setShowHidden] = useState<boolean>(false);

  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const project_actions = redux.getProjectActions(project_id);

  const useEditor = useEditorRedux<State>({ project_id, path });
  const is_loaded = useEditor("is_loaded");
  const dir = useEditor("dir");
  const favs = useEditor("favs")?.toJS() ?? {};

  useFileListingWatching(project_id, dir);
  const projectRunning = useProjectRunning(project_id);

  useEffect(() => {
    actions.setDir(path);
  }, []);

  const height = useTableHeight({
    tableRef,
    font_size,
    resize,
    rootRef,
    headerRef,
  });

  const listingsData = useListingsData({ project_id, useEditor, showHidden });

  if (!is_loaded) {
    return (
      <div
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: COLORS.GRAY_D,
        }}
      >
        <Loading />
      </div>
    );
  }

  function buttons(): JSX.Element {
    return (
      <div>
        <ButtonGroup>
          <Button onClick={() => setDebugMe(!debugMe)}>debug</Button>
          <Button onClick={() => project_actions.open_file({ path })}>
            Open File({path})
          </Button>
          <span style={{ whiteSpace: "nowrap" }}>
            <Switch onClick={(val) => setShowHidden(val)} /> Hidden
          </span>
        </ButtonGroup>
      </div>
    );
  }

  function debug(): JSX.Element | null {
    if (!debugMe) return null;
    return (
      <ul>
        <li>is_loaded: {JSON.stringify(is_loaded)}</li>
        <li>project_id: {project_id}</li>
        <li>path: {path}</li>
        <li>dir: {dir}</li>
        <li>fontSize: {font_size}</li>
        <li>favs: {JSON.stringify(favs)}</li>
        <li>projectRunning: {JSON.stringify(projectRunning)}</li>
        <li>open_files_order: {JSON.stringify(open_files_order)}</li>
        <li>height: {JSON.stringify(height)}</li>
      </ul>
    );
  }

  function timeColumn(): JSX.Element {
    return (
      <Column<FileEntry>
        title="Time"
        dataIndex="time"
        align="right"
        sorter={(a, b) => a.time - b.time}
        defaultSortOrder={"descend"}
        render={(time) => <TimeAgo date={time} />}
      />
    );
  }

  function starColumn(): JSX.Element {
    return (
      <Column<FileEntry>
        title="Star"
        dataIndex="name"
        render={(name) => {
          const isFav = favs[name] != null;
          const icon = isFav ? (
            <StarFilled style={{ color: COLORS.ANTD_YELL_M }} />
          ) : (
            <StarOutlined style={{ color: COLORS.GREY_D }} />
          );
          return (
            <Button
              block
              type="text"
              onClick={() => actions.toggleFavorite(name, !isFav)}
            >
              {icon}
            </Button>
          );
        }}
      />
    );
  }

  function nameColumn(): JSX.Element {
    return (
      <Column<FileEntry>
        title="Name"
        dataIndex="name"
        sorter={(a, b) => a.nameLC.localeCompare(b.nameLC)}
        render={(name) => {
          return <div onClick={() => alert(`click: ${name}`)}>{name}</div>;
        }}
      />
    );
  }

  function sizeColumn(): JSX.Element {
    return <Column<FileEntry> title="Size" dataIndex="size" align="right" />;
  }

  function rowSelection(
    selectedRowKeys: React.Key[],
    selectedRows: FileEntry[]
  ) {
    console.log(
      `selectedRowKeys: ${selectedRowKeys}`,
      "selectedRows: ",
      selectedRows
    );
  }

  function filesTable(): JSX.Element {
    if (listingsData == null) return <Loading />;

    const pagination = {
      pageSize: 50,
      hideOnSinglePage: true,
      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
    };

    return (
      <Table<FileEntry>
        ref={tableRef}
        rowClassName={() => "cursor-pointer"}
        dataSource={listingsData}
        pagination={pagination}
        scroll={{ y: height }}
        size="small"
        sortDirections={["ascend", "descend"]}
        rowSelection={{ type: "checkbox", onChange: rowSelection }}
      >
        {starColumn()}
        {nameColumn()}
        {timeColumn()}
        {sizeColumn()}
      </Table>
    );
  }

  return (
    <div ref={rootRef} className={"smc-vfill"} style={ROOT_STYLE}>
      <div ref={headerRef}>
        <h1>File Editor</h1>
        {buttons()}
        {debug()}
      </div>
      {filesTable()}
    </div>
  );
};

export default Listing;
