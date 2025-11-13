/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Checkbox, Tooltip } from "antd";

interface Props {
  disabled: boolean;
  changesMode: boolean; // whether or not in changes mode.
  setChangesMode: (boolean) => void;
}

export function ChangesMode({ disabled, changesMode, setChangesMode }: Props) {
  const toggle = () => {
    setChangesMode(!changesMode);
  };

  return (
    <Tooltip
      placement="top"
      title="Toggle whether or not to show the changes from one point in time to another"
      mouseEnterDelay={1}
    >
      <Checkbox
        disabled={disabled}
        onChange={toggle}
        checked={disabled ? false : changesMode}
      >
        Changes
      </Checkbox>
    </Tooltip>
  );
}
