/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { Button } from "antd";
import { Icon, MenuItem, DropdownMenu } from "../../r_misc";
import { file_associations } from "../../file-associations";
import { COLORS } from "smc-util/theme";
import * as misc from "smc-util/misc";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { file_options } = require("../../editor");

interface Props {
  create_file: (ext?: string) => void;
}

export const NewFileDropdown: React.FC<Props> = React.memo((props: Props) => {
  const { create_file } = props;

  const new_file_button_types = React.useMemo((): string[] => {
    const list = misc.keys(file_associations).sort();
    const extensions: string[] = [];
    const file_types_so_far = {};
    for (const ext of list) {
      if (!ext) continue;
      const data = file_associations[ext];
      if (data.exclude_from_menu) continue;
      if (data.name != undefined && !file_types_so_far[data.name]) {
        file_types_so_far[data.name] = true;
        extensions.push(ext);
      }
    }
    return extensions;
  }, misc.keys(file_associations));

  function dropdown_item(ext: string) {
    const data = file_options("x." + ext);
    const text = (
      <>
        <span style={{ textTransform: "capitalize" }}>{data.name}</span>{" "}
        <span style={{ color: COLORS.GRAY }}>(.{ext})</span>
      </>
    );
    return (
      <MenuItem className={"dropdown-menu-left"} key={ext}>
        <Icon name={data.icon} /> {text}
      </MenuItem>
    );
  }

  return (
    <span
      className={"pull-right dropdown-splitbutton-left"}
      style={{ marginRight: "5px" }}
    >
      <Button.Group>
        <Button onClick={() => create_file()}>
          <span>
            <Icon name="file" /> More file types...
          </span>
        </Button>

        <DropdownMenu onClick={(ext) => create_file(ext)} button={true}>
          {new_file_button_types.map(dropdown_item)}
        </DropdownMenu>
      </Button.Group>
    </span>
  );
});
