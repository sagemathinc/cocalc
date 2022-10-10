/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { open_new_tab } from "@cocalc/frontend/misc";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { Button } from "antd";
import { join } from "path";
import { useTypedRedux } from "../../app-framework";

interface Props {
  project_id?: string;
}

export const BuyLicenseForProject: React.FC<Props> = (props: Props) => {
  const { project_id } = props;

  const commercial = useTypedRedux("customize", "commercial");

  function url(): string {
    const base = join(appBasePath, "store", "site-license");
    if (is_valid_uuid_string(project_id)) {
      return `${base}?project_id=${project_id}`;
    } else {
      return base;
    }
  }

  if (!commercial) {
    return null;
  } else {
    return (
      <Button
        type="primary"
        icon={<Icon name="shopping-cart" />}
        onClick={() => {
          open_new_tab(url());
        }}
      >
        Buy a license ...
      </Button>
    );
  }
};
