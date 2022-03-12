/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "@cocalc/frontend/app-framework";
import { ISO_to_Date } from "@cocalc/util/misc";
import { is_different_date, TimeAgo } from "@cocalc/frontend/components";

interface BigTimeProps {
  date: string | number | Date;
}

function isSame(prev, next) {
  return !is_different_date(prev.date, next.date);
}

export const BigTime: React.FC<BigTimeProps> = React.memo(
  (props: BigTimeProps) => {
    let { date } = props;
    if (date == null) return null;
    if (typeof date === "string") {
      date = ISO_to_Date(date);
    }
    return <TimeAgo popover={true} date={date} />;
  },
  isSame
);
