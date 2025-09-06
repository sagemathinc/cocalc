/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import React, { useState } from "react";
import { Map } from "immutable";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { all_fields_equal } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";

interface MoreOutputProps {
  message: Map<string, any>;
  id: string;
  actions?: JupyterActions; // if not set, then can't get more output (button disabled)
}

function should_memoize(prev, next) {
  return all_fields_equal(prev, next, ["message", "id"]);
}

export const MoreOutput: React.FC<MoreOutputProps> = React.memo(
  (props: MoreOutputProps) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const { id, message, actions } = props;

    if (error) {
      return (
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "15px" }}
        />
      );
    }

    if (actions == null || message.get("expired")) {
      return (
        <Button style={{ marginTop: "5px" }} disabled>
          <Icon name="eye-slash" /> Additional output not available
        </Button>
      );
    } else if (actions.fetchMoreOutput == null) {
      // e.g., on the share server, at least until we implement fetching additional output
      // there, which does make sense to do.
      return (
        <div style={{ margin: "15px", fontSize: "12pt" }}>
          Large output truncated: edit to see additional output
        </div>
      );
    } else {
      return (
        <Button
          disabled={loading}
          onClick={async () => {
            try {
              setLoading(true);
              await actions.fetchMoreOutput(id);
            } catch (err) {
              console.log("not available", err);
              setError(`${err}`);
            } finally {
              setLoading(false);
            }
          }}
          style={{ marginTop: "5px" }}
        >
          <Icon name="eye" /> Fetch additional output... {loading && <Spin />}
        </Button>
      );
    }
  },
  should_memoize,
);
