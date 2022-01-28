/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import { ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Actions, State } from "./actions";

interface Props {
  actions: Actions;
  path: string;
  project_id: string;
  font_size?: number;
}

const Files: React.FC<Props> = (props: Props) => {
  const { actions, path, project_id, font_size } = props;

  const useEditor = useEditorRedux<State>({ project_id, path });
  const is_loaded = useEditor("is_loaded");

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

  function buttons() {
    <div>
      <ButtonGroup>
        <Button onClick={() => actions.test(path)}>Test</Button>
      </ButtonGroup>
    </div>;
  }

  function content() {
    return <pre>fontSize: {font_size}</pre>;
  }

  return (
    <div>
      <h1>File Editor</h1>
      {buttons()}
      {content()}
    </div>
  );
};

export default Files;
