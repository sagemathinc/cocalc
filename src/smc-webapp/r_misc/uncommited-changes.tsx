/**
 * Component that shows a warning message if has_uncommitted_changes is true for more than a few seconds.
 */

import * as React from "react";

interface Props {
  has_uncommitted_changes?: boolean;
  delay_ms?: number; // Default = 5000
}

const STYLE: React.CSSProperties = {
  backgroundColor: "red",
  color: "white",
  padding: "5px",
  fontWeight: "bold",
  marginLeft: "5px",
  marginRight: "-5px",
  borderRadius: "3px"
};

export function UncommittedChanges({
  has_uncommitted_changes,
  delay_ms = 5000
}: Props) {
  const [show_error, set_error] = React.useState(false);

  /**
   * A new interval is created iff has_uncommitted_changes or delay_ms change
   * So error is only set to true when the prop doesn't change for ~delay_ms time
   */
  React.useEffect(() => {
    const timeout_id = setTimeout(() => {
      if (has_uncommitted_changes) {
        set_error(true);
      }
    }, delay_ms + 10);

    return function cleanup() {
      clearInterval(timeout_id);
    };
  }, [has_uncommitted_changes, delay_ms]);

  if (show_error) {
    return <span style={STYLE}>NOT saved!</span>;
  } else {
    return <span />; // TODO: return undefined?
  }
}
