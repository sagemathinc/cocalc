/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Component, Rendered } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { render_project_quota } from "./util";
import { FormattedMessage } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";

export class ProjectQuotaBoundsTable extends Component {
  public render(): Rendered {
    const max = PROJECT_UPGRADES.max_per_project;
    return (
      <Panel
        header={
          <span>
            Maximum possible quotas{" "}
            <strong>
              per <FormattedMessage {...labels.project} />
            </strong>{" "}
            (if you need more, contact us at <HelpEmailLink />)
          </span>
        }
      >
        {PROJECT_UPGRADES.field_order
          .filter((name) => max[name])
          .map((name) => render_project_quota(name, max[name]))}
      </Panel>
    );
  }
}
