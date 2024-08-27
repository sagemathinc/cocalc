/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  id: string;
  actions: TimeTravelActions;
}

export function LoadFullHistory({ id, actions }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  return (
    <Tooltip
      title={
        "Load the full edit history for this file.  This may take a long time."
      }
    >
      <Button
        disabled={loading}
        onClick={async () => {
          try {
            setLoading(true);
            await actions.loadFullHistory();
          } catch (err) {
            console.log("ERROR!", err);
            actions.set_error(`${err}`);
          } finally {
            setLoading(false);
            actions.setNewestVersion(id);
          }
        }}
      >
        <Icon name="file-archive" /> Load All {loading && <Spin />}
      </Button>
    </Tooltip>
  );
}
