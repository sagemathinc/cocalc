import { React, Rendered } from "../app-framework";
import { Icon } from "../r_misc/icon";

export function powered_by_stripe(): Rendered {
  return (
    <span>
      Powered by{" "}
      <a
        href="https://stripe.com/"
        rel="noopener"
        target="_blank"
        style={{ top: "7px", position: "relative", fontSize: "23pt" }}
      >
        <Icon name="cc-stripe" />
      </a>
    </span>
  );
}

import { PROJECT_UPGRADES } from "smc-util/schema";
import { Tip } from "../r_misc/tip";
import { Space } from "../r_misc/space";
import { round1, plural } from "smc-util/misc";
export function render_project_quota(name: string, value: number): Rendered {
    const data = PROJECT_UPGRADES.params[name];
    if (data == null) {
      throw Error(`unknown quota ${name}`);
    }
    let amount: number = value * data.pricing_factor;
    let unit: string = data.pricing_unit;
    if (unit === "day" && amount < 2) {
      amount = 24 * amount;
      unit = "hour";
    }
    return (
      <div key={name} style={{ marginBottom: "5px", marginLeft: "10px" }}>
        <Tip title={data.display} tip={data.desc}>
          <span style={{ fontWeight: "bold", color: "#666" }}>
            {round1(amount)} {plural(amount, unit)}
          </span>
          <Space />
          <span style={{ color: "#999" }}>{data.display}</span>
        </Tip>
      </div>
    );
  }
