/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


import { A, Icon } from "../../components";

// This is a URL only visible to certain users of https://cocalc.com!
const STATS_URL =
  "https://cocalc.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html";

export const HistoricalStats: React.FC = () => {
  return (
    <span>
      <Icon name="line-chart" style={{ width: "1.125em" }} />{" "}
      <A href={STATS_URL}>Historical Usage Statistics...</A>
    </span>
  );
};
