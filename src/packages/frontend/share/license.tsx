/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Select the license for a public share.

NOTE: Our approach to state here means that two people can't
simultaneously edit the license and have it be synced properly
between them.  I think this is acceptable, since it is unlikely
for people to do that.
*/

import { FC, memo, useMemo, useState } from "react";

import { DropdownMenu } from "@cocalc/frontend/components";
import { MenuItems } from "../components/dropdown-menu";
import { LICENSES } from "./licenses";

interface Props {
  license: string;
  set_license: (license: string) => void;
  disabled?: boolean;
}

export const License: FC<Props> = memo((props: Props) => {
  const { license, set_license, disabled = false } = props;

  const [sel_license, set_sel_license] = useState(license);

  function select(license: string): void {
    set_sel_license(license);
    set_license(license);
  }

  function displayed_license(): string {
    const x = LICENSES[sel_license];
    if (x == null) {
      // corrupt data?
      return LICENSES["other"];
    } else {
      return x;
    }
  }

  function render_items(): MenuItems {
    return Object.keys(LICENSES).map((key) => {
      return {
        key: key,
        onClick: () => select(key),
        label: LICENSES[key],
      };
    });
  }

  const items: MenuItems = useMemo(() => render_items(), [sel_license]);

  return (
    <DropdownMenu
      title={displayed_license()}
      id={"license-menu"}
      disabled={disabled}
      button={true}
      items={items}
    />
  );
});
