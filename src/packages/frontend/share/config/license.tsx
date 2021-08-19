/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Select the license for a public share.

NOTE: Our approach to state here means that two people can't
simultaneously edit the license and have it be synced properly
between them.  I think this is acceptable, since it is unlikely
for people to do that.
*/

import { React } from "../../app-framework";
import { MenuItem, DropdownMenu } from "../../r_misc";

import { LICENSES } from "./licenses";

interface Props {
  license: string;
  set_license: (license: string) => void;
  disabled?: boolean;
}

export const License: React.FC<Props> = React.memo((props: Props) => {
  const { license, set_license, disabled = false } = props;

  const [sel_license, set_sel_license] = React.useState(license);

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

  function render_items() {
    return Object.keys(LICENSES).map((key) => (
      <MenuItem key={key} eventKey={key} active={key === sel_license}>
        {LICENSES[key]}
      </MenuItem>
    ));
  }

  return (
    <DropdownMenu
      title={displayed_license()}
      id={"license-menu"}
      onClick={select}
      disabled={disabled}
      button={true}
    >
      {render_items()}
    </DropdownMenu>
  );
});
