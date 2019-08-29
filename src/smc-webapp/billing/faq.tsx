import { Component, React, Rendered } from "../app-framework";
import { A } from "smc-webapp/r_misc/A";

export class FAQ extends Component {
  public render(): Rendered {
    return (
      <div>
        <a id="faq" />
        <h2>Frequently asked questions</h2>
        <ul>
          <li>
            <A href={"https://doc.cocalc.com/billing.html"}>
              Billing, quotas, and upgrades
            </A>
          </li>
          <li>
            <A href="https://doc.cocalc.com/project-faq.html">Projects</A>
          </li>
        </ul>
      </div>
    );
  }
}
