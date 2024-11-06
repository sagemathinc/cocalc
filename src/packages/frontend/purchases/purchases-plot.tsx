import { Checkbox, Flex, Tooltip } from "antd";
import SpendPlot from "./spend-plot";
import { useMemo, useState } from "react";
import { field_cmp } from "@cocalc/util/misc";

export default function PurchasesPlot({ purchases }) {
  const [credits, setCredits] = useState<boolean>(false);

  const data = useMemo(() => {
    let v;
    if (credits) {
      v = purchases.filter((x) => (x.cost ?? 0) < 0 && x.time);
    } else {
      v = purchases.filter((x) => (x.cost ?? 0) > 0 && x.time);
    }
    v = v.map(({ cost, time }) => {
      return {
        amount: cost,
        date: time ? new Date(time) : new Date(),
      };
    });
    v.sort(field_cmp("date"));
    return v;
  }, [purchases, credits]);

  return (
    <SpendPlot
      data={data}
      title={
        <Flex>
          <Tooltip title="This is a plot of the internal purchases you have made using CoCalc credit listed in the table above. Credits are not shown.">
            <div>Plot of CoCalc Purchases Shown Above</div>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Tooltip title="Show plot only of credits.  If unchecked only charges are included.">
            <Checkbox
              value={credits}
              onChange={(e) => setCredits(e.target.checked)}
            >
              Credits
            </Checkbox>
          </Tooltip>
        </Flex>
      }
      style={{ margin: "15px 0" }}
    />
  );
}
