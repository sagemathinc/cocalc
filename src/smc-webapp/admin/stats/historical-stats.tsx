/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../../app-framework";
import { A, Icon } from "../../r_misc";

// This is a URL only visible to certain users of https://cocalc.com!
const STATS_URL =
  "https://cocalc.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html";

export const HistoricalStats: React.FC = () => {
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");
  if (!is_cocalc_com) {
    return <></>;
  }
  return (
    <span>
      <Icon name="line-chart" fixedWidth />{" "}
      <A href={STATS_URL}>Historical Usage Statistics...</A>
    </span>
  );
};
