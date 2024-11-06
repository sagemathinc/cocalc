import SpendPlot from "./spend-plot";
import { useMemo } from "react";
import { field_cmp } from "@cocalc/util/misc";

/*
          data={purchases
            .filter((x) => (x.cost ?? 0) > 0 && x.time)
            .map((x) => {
              return {
                amount: x.cost ?? 0,
                date: x.time ? new Date(x.time) : new Date(),
              };
            })}
        />

*/

export default function PurchasesPlot({ purchases }) {
  const data = useMemo(() => {
    const v = purchases
      .filter((x) => (x.cost ?? 0) < 0 && x.time)
      .map(({ cost, time }) => {
        return {
          amount: -cost,
          date: time ? new Date(time) : new Date(),
        };
      });
    v.sort(field_cmp("date"));
    return v;
  }, [purchases]);
  return (
    <SpendPlot
      data={data}
      title={"CoCalc Purchases Shown Above"}
      description={
        "This is a plot of the internal purchases you have made using CoCalc credit listed in the table above."
      }
      style={{ margin: "15px 0" }}
    />
  );
}
