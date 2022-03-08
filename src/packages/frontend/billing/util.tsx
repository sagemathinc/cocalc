/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered } from "../app-framework";
import { Icon } from "../components/icon";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { Tip } from "../components/tip";
import { Space } from "../components/space";
import { round1, plural } from "@cocalc/util/misc";
import { stripeAmount } from "@cocalc/util/misc";

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

export function render_amount(amount: number, currency: string) {
  return (
    <div style={{ float: "right" }}>{stripeAmount(amount, currency)}</div>
  );
}
