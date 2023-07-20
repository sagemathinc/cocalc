/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import basePath from "lib/base-path";
import { join } from "path";
import { NewFileButton } from "@cocalc/frontend/project/new/new-file-button";

export default function Subscriptions() {
  return (
    <div style={{ textAlign: "center" }}>
      <NewFileButton
        href={join(basePath, "settings", "subscriptions")}
        icon="calendar"
        name="Moved to the settings page..."
      />
    </div>
  );
}
