/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";

import { React } from "@cocalc/frontend/app-framework";
import { DropdownMenu, Icon } from "@cocalc/frontend/components";
import { MenuItems } from "@cocalc/frontend/components/dropdown-menu";
import { file_associations } from "@cocalc/frontend/file-associations";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { file_options } = require("@cocalc/frontend/editor");

interface Props {
  create_file: (ext?: string) => void;
}

export const NewFileDropdown: React.FC<Props> = React.memo((props: Props) => {
  const { create_file } = props;

  // TODO maybe filter by configuration.get("main", {disabled_ext: undefined}) ?
  const items = React.useMemo((): MenuItems => {
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
    return extensions.map(dropdown_item);
  }, misc.keys(file_associations));

  function dropdown_item(ext: string) {
    const data = file_options("x." + ext);
    const text = (
      <>
        <span style={{ textTransform: "capitalize" }}>{data.name}</span>{" "}
        <span style={{ color: COLORS.GRAY }}>(.{ext})</span>
      </>
    );

    return {
      key: ext,
      onClick: () => create_file(ext),
      label: text,
    };
  }

  return (
    <span
      className={"pull-right dropdown-splitbutton-left"}
      style={{ marginRight: "5px" }}
    >
      <Button.Group>
        <Button size="large" onClick={() => create_file()}>
          <span>
            <Icon name="file" /> More file types...
          </span>
        </Button>

        <DropdownMenu size="large" button={true} items={items} />
      </Button.Group>
    </span>
  );
});
