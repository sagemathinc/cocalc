/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { useState } from "react";
import { Button, Spin, Tooltip } from "antd";
import { TimeTravelActions } from "./actions";
import { Icon } from "../../components";

interface Props {
  actions: TimeTravelActions;
  disabled?: boolean;
}

export function LoadMoreHistory({ actions, disabled }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  return (
    <Tooltip
      title={
        disabled
          ? "All TimeTravel history is loaded"
          : "Load more TimeTravel history"
      }
    >
      <Button
        disabled={loading || disabled}
        onClick={async () => {
          try {
            setLoading(true);
            await actions.loadMoreHistory();
          } catch (err) {
            console.log("ERROR!", err);
            actions.set_error(`${err}`);
          } finally {
            setLoading(false);
          }
        }}
      >
        <Icon name="file-archive" /> Load More {loading && <Spin />}
      </Button>
    </Tooltip>
  );
}
