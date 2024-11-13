import { Flex, Tooltip } from "antd";
import BalancePlot from "./balance-plot";
import { useMemo } from "react";
import { field_cmp } from "@cocalc/util/misc";

export default function PurchasesPlot({ purchases }) {
  const data = useMemo(() => {
    const v = purchases
      .filter((x) => x.time)
      .map(({ balance, time }) => {
        return {
          amount: balance,
          date: time ? new Date(time) : new Date(),
        };
      });
    v.sort(field_cmp("date"));
    return v;
  }, [purchases]);

  return (
    <BalancePlot
      data={data}
      title={
        <Flex>
          <Tooltip title="This is a plot of your account balance based on the transactions loaded above.">
            <div>Plot of Your Balance</div>
          </Tooltip>
          <div style={{ flex: 1 }} />
        </Flex>
      }
      style={{ margin: "15px 0" }}
    />
  );
}
