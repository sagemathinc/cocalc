/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ISO_to_Date } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components";

interface BigTimeProps {
  date: string | number | Date;
}

export function BigTime({ date }: BigTimeProps) {
  if (date == null) {
    return null;
  }
  if (typeof date === "string") {
    date = ISO_to_Date(date);
  }
  return <TimeAgo date={date} />;
}
