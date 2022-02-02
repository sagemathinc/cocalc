/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS } from "immutable";
import { ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import {
  redux,
  useEditorRedux,
  useEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Button } from "antd";
import { Actions, State } from "./actions";
import { useFileListingWatching } from "./useFileListingWatching";
import { useProjectRunning } from "./useProjectRunning";

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size?: number;
  name: string;
}

const Listing: React.FC<Props> = (props: Props) => {
  const { actions, path = "", project_id, font_size } = props;

  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const project_actions = redux.getProjectActions(project_id);
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );

  const useEditor = useEditorRedux<State>({ project_id, path });
  const is_loaded = useEditor("is_loaded");
  const dir = useEditor("dir");
  const favs = useEditor("favs").toJS();

  useFileListingWatching(project_id, dir);
  const projectRunning = useProjectRunning(project_id);

  useEffect(() => {
    actions.setDir(path);
  }, []);

  if (!is_loaded) {
    return (
      <div
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: "#999",
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
          <Button onClick={() => actions.debugMe(path)}>debugMe({path})</Button>
          <Button onClick={() => project_actions.open_file(path)}>
            Open File({path})
          </Button>
          <Button onClick={() => actions.setFavs(fromJS({ xxx: "test" }))}>
            test favs
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  function debug(): JSX.Element {
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
      </ul>
    );
  }

  function content(): JSX.Element {
    return (
      <pre style={{ fontSize: "8pt", overflowY: "auto" }}>
        {JSON.stringify(directory_listings, null, 2)}
      </pre>
    );
  }

  return (
    <div>
      <h1>File Editor</h1>
      {buttons()}
      {debug()}
      {content()}
    </div>
  );
};

export default Listing;
