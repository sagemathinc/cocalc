/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { set_local_storage } from "@cocalc/frontend/misc/local-storage";
import { Form, Switch } from "antd";

export function ToggleExplanations({ showExplanations, setShowExplanations }) {
  return (
    <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
      <div style={{ float: "right" }}>
        <Switch
          checked={showExplanations}
          onChange={(show) => {
            setShowExplanations(show);
            // ugly and ignores basePath -- change later:
            set_local_storage(
              "store_site_license_show_explanations",
              show ? "t" : ""
            );
          }}
        />{" "}
        Show explanations
      </div>
    </Form.Item>
  );
}
