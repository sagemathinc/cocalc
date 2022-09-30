/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { open_new_tab } from "@cocalc/frontend/misc";
import { Button } from "antd";
import { join } from "path";

export const BuyLicenseForProject: React.FC<{ project_id: string }> = (props: {
  project_id: string;
}) => {
  const { project_id } = props;
  const base = join(appBasePath, "store", "site-license");
  const url = `${base}?project_id=${project_id}`;

  return (
    <Button
      type="primary"
      icon={<Icon name="shopping-cart" />}
      onClick={() => {
        open_new_tab(url);
      }}
    >
      Buy a license ...
    </Button>
  );
};
