import { Component, React, Rendered } from "../app-framework";
import { PROJECT_UPGRADES } from "smc-util/schema";
import { Tip } from "../r_misc/tip";
import { Space } from "../r_misc/space";
import { round1, plural } from "smc-util/misc";
const { Panel } = require("react-bootstrap"); // since the typescript declarations are our of sync with our crappy old version.

export class ProjectQuotaBoundsTable extends Component {
  private render_project_quota(name: string, value: number): Rendered {
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

  public render(): Rendered {
    const max = PROJECT_UPGRADES.max_per_project;
    return (
      <Panel
        header={
          <span>
            Maximum possible quotas <strong>per project</strong>
          </span>
        }
      >
        {PROJECT_UPGRADES.field_order
          .filter(name => max[name])
          .map(name => this.render_project_quota(name, max[name]))}
      </Panel>
    );
  }
}
