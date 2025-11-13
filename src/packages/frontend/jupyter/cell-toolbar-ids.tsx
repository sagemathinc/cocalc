/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The tag editing toolbar functionality for cells.
*/

import { Button, Input, Space, Tooltip } from "antd";
import { useMemo, useState } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components";
import { Map as ImmutableMap } from "immutable";
import type { JupyterActions } from "./browser-actions";
import { useEffect } from "react";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

interface Props {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export default function IdsToolbar({ actions, cell }: Props) {
  const [input, setInput] = useState<string>(cell.get("id"));
  const frameActions = useNotebookFrameActions();

  useEffect(() => {
    setInput(cell.get("id"));
  }, [cell.get("id")]);

  const valid = useMemo(() => {
    return isValid(input);
  }, [input]);

  function setId() {
    let id = input;
    if (!valid || id == cell.get("id")) {
      return;
    }
    const ids = new Set(actions.store.get_cell_ids_list() ?? []);
    if (ids.has(id)) {
      let n = 1;
      let pattern = `-${n}`;
      while (ids.has(`${id.slice(0, 64 - pattern.length)}${pattern}`)) {
        n += 1;
        pattern = `-${n}`;
      }
      id = `${id.slice(0, 64 - pattern.length)}${pattern}`;
    }
    if (id != cell.get("id")) {
      const frame = frameActions.current;
      actions.setCellId(cell.get("id"), id);
      setTimeout(() => frame?.set_cur_id(id), 1);
    }
  }

  return (
    <div style={{ width: "100%", paddingTop: "2.5px" }}>
      <Space style={{ float: "right" }}>
        <Input
          onFocus={() => actions.blur_lock()}
          onBlur={() => {
            actions.focus_unlock();
            setId();
          }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          size="small"
          onPressEnter={() => {
            setId();
          }}
        />
        <Tooltip
          title={
            <>
              <A
                style={{ color: "white" }}
                href="https://jupyter.org/enhancement-proposals/62-cell-id/cell-id.html"
              >
                Jupyter cell IDs
              </A>{" "}
              must be between 1 and 64 characters and use only letters, numbers,
              dashes and underscores.
            </>
          }
        >
          <Button
            size="small"
            danger={!valid}
            type={"primary"}
            disabled={input == cell.get("id")}
            onClick={setId}
          >
            {!valid ? "Invalid Id" : "Cell Id"}
          </Button>
        </Tooltip>
      </Space>
    </div>
  );
}

const regExp = /^[a-zA-Z0-9-_]{1,64}$/;
function isValid(id: string) {
  // true if it matches the regexp ^[a-zA-Z0-9-_]+$ and is between 1 and 64 characters in length,
  // as defined in https://github.com/jupyter/nbformat/blob/main/nbformat/v4/nbformat.v4.5.schema.json#L97
  return regExp.test(id);
}
