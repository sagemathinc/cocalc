/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS } from "immutable";
import { Table } from "antd";
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
import { Loading } from "@cocalc/frontend/components";
import { Button } from "antd";
import { Actions, State } from "./actions";
import { useFileListingWatching } from "./useFileListingWatching";
import { useProjectRunning } from "./useProjectRunning";
import { COLORS } from "@cocalc/util/theme";
import { StarFilled, StarOutlined } from "@ant-design/icons";

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

interface FileEntry {
  key: string;
  name: string;
  size: number;
}

const Listing: React.FC<Props> = (props: Props) => {
  const { actions, path = "", project_id, font_size, resize } = props;

  const [height, setHeight] = useState<number>(0);
  const [debugMe, setDebugMe] = useState<boolean>(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const project_actions = redux.getProjectActions(project_id);
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );

  const useEditor = useEditorRedux<State>({ project_id, path });
  const is_loaded = useEditor("is_loaded");
  const dir = useEditor("dir");
  const favs = useEditor("favs")?.toJS() ?? {};

  useFileListingWatching(project_id, dir);
  const projectRunning = useProjectRunning(project_id);

  useEffect(() => {
    actions.setDir(path);
  }, []);

  useEffect(() => {
    if (
      tableRef.current == null ||
      rootRef.current == null ||
      headerRef.current == null
    )
      return;
    const pagerEl = $(tableRef.current).find(".ant-pagination").first();
    const pagerHeight = pagerEl.height() ?? 0;
    const pagerMargins =
      pagerEl != null
        ? parseInt(pagerEl.css("margin-top")) +
          parseInt(pagerEl.css("margin-bottom"))
        : 0;
    const tableHeaderHeight =
      $(tableRef.current).find(".ant-table-header").first().height() ?? 0;
    const rootDivHeight = $(rootRef.current).height() ?? 0;
    const headerHeight = $(headerRef.current).height() ?? 0;
    setHeight(
      rootDivHeight -
        headerHeight -
        pagerHeight -
        tableHeaderHeight -
        pagerMargins
    );
  }, [tableRef.current, font_size, resize]);

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

  function star(): JSX.Element {
    return (
      <Column<FileEntry>
        title="Star"
        dataIndex="name"
        render={(name) => {
          const isFav = favs[name] != null;
          const icon = isFav ? <StarFilled /> : <StarOutlined />;
          return (
            <Button onClick={() => actions.toggleFavorite(name, !isFav)}>
              {icon}
            </Button>
          );
        }}
      />
    );
  }

  function filesTable(): JSX.Element {
    if (dir == null) return <Loading />;
    const data = directory_listings
      .get(dir)
      ?.map((file) => {
        return {
          key: file.get("name"),
          name: file.get("name"),
          size: file.get("size"),
          time: file.get("mtime"),
        };
      })
      .toJS();
    return (
      <Table<FileEntry>
        ref={tableRef}
        dataSource={data}
        pagination={{ pageSize: 50 }}
        scroll={{ y: height }}
        size="small"
      >
        {star()}
        <Column<FileEntry> title="Name" dataIndex="name" />
        <Column<FileEntry> title="Size" dataIndex="size" />
        <Column<FileEntry> title="Time" dataIndex="time" />
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
