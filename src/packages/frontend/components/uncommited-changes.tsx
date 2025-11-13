/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.

In case the project-id is known via file context and the project is not running, this *also* will
autoamtically start the project running.  This is to **avoid data loss**, since there is no way
to save what is not getting saved without starting the project.
*/

import { useState, useEffect } from "react";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  has_uncommitted_changes?: boolean;
  delay_ms?: number; // Default = 5000
  show_uncommitted_changes?: boolean;
  set_show_uncommitted_changes?: any;
}

const STYLE = {
  backgroundColor: "red",
  color: "white",
  padding: "0 5px",
  fontWeight: "bold",
  marginLeft: "5px",
  marginRight: "-5px",
  borderRadius: "3px",
  whiteSpace: "nowrap",
} as const;

/**
 * Shows `NOT saved!` if `has_uncommitted_changes` is true for ~delay_ms time.
 * Shows nothing if `has_uncommitted_changes` is false
 *
 * Does not work with changes to `delay_ms`
 */
export function UncommittedChanges({
  has_uncommitted_changes,
  show_uncommitted_changes,
  set_show_uncommitted_changes,
  delay_ms = 5000,
}: Props) {
  const { project_id } = useFileContext();
  const init = has_uncommitted_changes && (show_uncommitted_changes ?? false);
  const [showError, setShowError0] = useState<boolean>(!!init);

  const setShowError = (val) => {
    setShowError0(val);
    if (project_id != null && val && !showError) {
      // changed from no error to showing an error
      if (
        redux
          .getStore("projects")
          ?.getIn(["project_map", project_id, "state", "state"]) != "running"
      ) {
        redux.getActions("projects").start_project(project_id);
      }
    }
  };

  // A new interval is created iff has_uncommitted_changes or delay_ms change
  // So error is only set to true when the prop doesn't change for ~delay_ms time
  useEffect(() => {
    if (!init) {
      setShowError(!!init);
    }
    const intervalId = setInterval(() => {
      if (
        show_uncommitted_changes != null &&
        set_show_uncommitted_changes != null
      ) {
        const next = has_uncommitted_changes;
        set_show_uncommitted_changes(next);
        setShowError(!!next);
      } else {
        if (has_uncommitted_changes) {
          setShowError(true);
        }
      }
    }, delay_ms + 10);

    return () => {
      clearInterval(intervalId);
    };
  }, [has_uncommitted_changes, delay_ms, show_uncommitted_changes, init]);

  if (showError) {
    return <span style={STYLE}>NOT saved!</span>;
  } else {
    return null;
  }
}
