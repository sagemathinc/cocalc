/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.

import * as React from "react";

interface Props {
  has_uncommitted_changes?: boolean;
  delay_ms?: number; // Default = 5000
  show_uncommitted_changes?: boolean;
  set_show_uncommitted_changes?: any;
}

const STYLE: React.CSSProperties = {
  backgroundColor: "red",
  color: "white",
  padding: "5px",
  fontWeight: "bold",
  marginLeft: "5px",
  marginRight: "-5px",
  borderRadius: "3px",
  whiteSpace: "nowrap",
};

/**
 * Shows `NOT saved!` if `has_uncommitted_changes` is true for ~delay_ms time.
 * Shows nothing if `has_uncommitted_changes` is false
 *
 * Does not work with changes to `delay_ms`
 */
const UncommittedChangesFC = (props: Props) => {
  const {
    has_uncommitted_changes,
    show_uncommitted_changes,
    set_show_uncommitted_changes,
    delay_ms = 5000,
  } = props;
  const init = has_uncommitted_changes && (show_uncommitted_changes ?? false);
  const [show_error, set_error] = React.useState(init);

  // A new interval is created iff has_uncommitted_changes or delay_ms change
  // So error is only set to true when the prop doesn't change for ~delay_ms time
  React.useEffect(() => {
    if (!init) {
      set_error(init);
    }
    const interval_id = setInterval(() => {
      if (
        show_uncommitted_changes != null &&
        set_show_uncommitted_changes != null
      ) {
        const next = has_uncommitted_changes;
        set_show_uncommitted_changes(next);
        set_error(next);
      } else {
        if (has_uncommitted_changes) {
          set_error(true);
        }
      }
    }, delay_ms + 10);

    return function cleanup() {
      clearInterval(interval_id);
    };
  }, [has_uncommitted_changes, delay_ms, show_uncommitted_changes, init]);

  if (show_error) {
    return <span style={STYLE}>NOT saved!</span>;
  } else {
    return <span />; // TODO: return undefined?
  }
};

export const UncommittedChanges = React.memo(UncommittedChangesFC);
