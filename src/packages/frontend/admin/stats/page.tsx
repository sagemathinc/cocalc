/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Title } from "@cocalc/frontend/components";

import { HistoricalStats } from "./historical-stats";

export const UsageStatistics: React.FC = () => {
  const is_cocalc_com = useTypedRedux("customize", "is_cocalc_com");
  if (!is_cocalc_com) {
    return <></>;
  } else {
    return (
      <div>
        <Title level={4}>Usage Statistics</Title>
        <HistoricalStats />
      </div>
    );
  }
};
