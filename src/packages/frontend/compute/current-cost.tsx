import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Tooltip } from "antd";
import { currency, round4 } from "@cocalc/util/misc";

export default function CurrentCost({ state, cost_per_hour }) {
  const { color, stable } = STATE_INFO[state ?? "off"] ?? {};
  let cost;
  if (cost_per_hour == null) {
    cost = ""; // no info
  } else if (stable) {
    if (state == "deprovisioned") {
      cost = "";
    } else {
      const cost_per_month = `${currency(cost_per_hour * 730)}`;
      cost = (
        <Tooltip
          title={() => (
            <>
              Cost per hour (USD): ${round4(cost_per_hour)}
              <br /> Cost per month (USD): {cost_per_month}
            </>
          )}
          placement="right"
        >
          <span style={{ textWrap: "nowrap" }}>
            {currency(cost_per_hour)}/hour
          </span>
        </Tooltip>
      );
    }
  }

  return <span style={{ color, textWrap: "nowrap" }}>{cost}</span>;
}
