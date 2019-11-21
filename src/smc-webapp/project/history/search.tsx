import * as React from "react";
import { debounce } from "lodash";
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

export function LogSearch(props: Props) {
  let mounted = true;

  // [j3] This has to be an anti-pattern...
  React.useEffect(() => {
    return () => {
      mounted = false;
    };
  }, []);

  const open_selected = React.useCallback(
    (_value, info: any): void => {
      const e = props.selected?.get("event");
      if (e == undefined || typeof e === "string") {
        return;
      }

      switch (e.get("event")) {
        case "open":
          const target = e.get("filename");
          if (target != null) {
            props.actions.open_file({
              path: target,
              foreground: !info.ctrl_down
            });
          }
          break;
        case "set":
          props.actions.set_active_tab("settings");
      }
    },
    [props.selected, props.actions]
  );

  const on_change = React.useCallback(
    debounce((value: string): void => {
      if (!mounted) {
        return;
      }
      props.reset_cursor();
      props.actions.setState({ search: value });
    }, 300),
    [props.reset_cursor, props.actions]
  );

  return (
    <SearchInput
      autoFocus={true}
      autoSelect={true}
      placeholder="Search log..."
      value={props.search}
      on_change={on_change}
      on_submit={open_selected}
      on_up={props.decrement_cursor}
      on_down={props.increment_cursor}
      on_escape={() => {
        return props.actions.setState({ search: "" });
      }}
    />
  );
}
