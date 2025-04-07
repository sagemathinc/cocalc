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
  hasFullHistory?: boolean;
  loadedLegacyHistory?: boolean;
  legacyHistoryExists?: boolean;
}

export function LoadMoreHistory({
  actions,
  hasFullHistory,
  loadedLegacyHistory,
  legacyHistoryExists,
}: Props) {
  const [loading, setLoading] = useState<boolean>(false);

  let disabled = false;
  let f;
  if (hasFullHistory && (!legacyHistoryExists || loadedLegacyHistory)) {
    // no need for the button
    disabled = true;
    f = () => {};
  } else if (!hasFullHistory) {
    f = async () => {
      await actions.loadMoreHistory();
    };
  } else if (!legacyHistoryExists || loadedLegacyHistory) {
    return null;
  } else {
    f = async () => {
      await actions.loadLegacyHistory();
    };
  }

  return (
    <>
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
              await f();
            } catch (err) {
              console.log("ERROR!", err);
              actions.set_error(`${err}`);
            } finally {
              setLoading(false);
            }
          }}
        >
          <Icon name="file-archive" /> More {loading && <Spin />}
        </Button>
      </Tooltip>
    </>
  );
}
