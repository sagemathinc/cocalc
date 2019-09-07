import { Component, React, Rendered } from "../app-framework";

export class FAQ extends Component {
  public render(): Rendered {
    return (
      <div>
        <a id="faq" />
        <h2>Frequently asked questions</h2>
        <ul>
          <li>
            <a
              href="https://doc.cocalc.com/billing.html"
              rel="noopener"
              target="_blank"
            >
              Billing, quotas, and upgrades
            </a>
          </li>
          <li>
            <a
              href="https://doc.cocalc.com/project-faq.html"
              rel="noopener"
              target="_blank"
            >
              Projects
            </a>
          </li>
        </ul>
      </div>
    );
  }
}
