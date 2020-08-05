/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";

import { HistoricalStats } from "./historical-stats";

export const UsageStatistics: React.FC = () => {
  return (
    <div>
      <h3>Usage Statistics</h3>
      <HistoricalStats />
    </div>
  );
};
