/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { SystemEvent } from "./types";
import { lite } from "@cocalc/frontend/lite";

/**
 * This is used for these cases, where `account_id` isn't set.
 * This means, a back-end system process is responsible.
 * In the case of stopping a project, the name is recorded in the event.by field.
 **/
interface Props {
  event: SystemEvent;
}

export const SystemProcess: React.FC<Props> = ({ event }) => {
  if (lite) {
    return <span>You</span>;
  }
  if (event.by != null) {
    return (
      <span>
        System service <code>{event.by}</code>
      </span>
    );
  } else {
    return <span>A system service</span>;
  }
};
