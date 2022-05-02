/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The metadata editing toolbar.
*/

import { React } from "../app-framework";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Map as ImmutableMap } from "immutable";
import { JupyterActions } from "./browser-actions";

interface MetadataProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export const Metadata: React.FC<MetadataProps> = (props: MetadataProps) => {
  const { actions, cell } = props;
  function edit() {
    actions.edit_cell_metadata(cell.get("id"));
  }
  return (
    <div style={{ width: "100%" }}>
      <Button bsSize="small" onClick={edit} style={{ float: "right" }}>
        Edit Custom Metadata...
      </Button>
    </div>
  );
};
