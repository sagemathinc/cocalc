/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, Rendered } from "@cocalc/frontend/app-framework";

interface Props {
  account_id: string;
}

interface State {
  activity?: any;
}

export class Activity extends Component<Props, State> {
  render(): Rendered {
    return <div>Recent Activity</div>;
  }
}
