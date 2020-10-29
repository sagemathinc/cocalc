/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { useDebounce } from "../../hooks";
import { SearchInput } from "../../r_misc";
import { ProjectActions } from "smc-webapp/project_store";
import { EventRecordMap } from "./types";

interface Props {
  search?: string;
  actions: ProjectActions;
  selected?: EventRecordMap;
  increment_cursor: () => void;
  decrement_cursor: () => void;
  reset_cursor: () => void;
}

export const LogSearch: React.FC<Props> = ({
  search,
  selected,
  actions,
  reset_cursor,
  increment_cursor,
  decrement_cursor,
}) => {
  const open_selected = React.useCallback(
    (_value, info: any): void => {
      const e = selected?.get("event");
      if (e == undefined || typeof e === "string") {
        return;
      }

      switch (e.get("event")) {
        case "open":
          const target = e.get("filename");
          if (target != null) {
            actions.open_file({
              path: target,
              foreground: !info.ctrl_down,
            });
          }
          break;
        case "set":
          actions.set_active_tab("settings");
      }
    },
    [selected, actions]
  );

  const on_change = useDebounce(
    React.useCallback(
      (value: string): void => {
        reset_cursor();
        actions.setState({ search: value });
      },
      [reset_cursor, actions]
    ),
    150
  );

  return (
    <SearchInput
      autoFocus={true}
      autoSelect={true}
      placeholder="Search log..."
      value={search}
      on_change={on_change}
      on_submit={open_selected}
      on_up={decrement_cursor}
      on_down={increment_cursor}
      on_escape={(): void => {
        actions.setState({ search: "" });
      }}
    />
  );
};
