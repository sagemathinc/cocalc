import * as React from "react";

/**
 * This is used for these cases, where `account_id` isn't set.
 * This means, a back-end system process is responsible.
 * In the case of stopping a project, the name is recorded in the event.by field.
 **/
export function SystemProcess({
  event
}: {
  event: { by: React.ReactNode };
}): JSX.Element {
  if (event.by != null) {
    return (
      <span>
        System service <code>{event.by}</code>
      </span>
    );
  } else {
    return <span>A system service</span>;
  }
}
