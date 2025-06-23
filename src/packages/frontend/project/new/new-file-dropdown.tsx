/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";

import { React } from "@cocalc/frontend/app-framework";
import {
  DropdownMenu,
  MenuItems,
} from "@cocalc/frontend/components/dropdown-menu";
import { Icon } from "@cocalc/frontend/components/icon";
import { file_associations } from "@cocalc/frontend/file-associations";
import { EXTs } from "@cocalc/frontend/project/explorer/file-listing/utils";
import { keys } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useIntl } from "react-intl";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { file_options } = require("@cocalc/frontend/editor");

interface Props {
  create_file: (ext?: string) => void;
  mode: "project" | "flyout";
  title?: string;
  showDown?: boolean;
  button?: boolean;
  cacheKey?: string;
}

function makeList(mode: "project" | "flyout") {
  const list = keys(file_associations).sort();
  switch (mode) {
    case "project":
      return list;
    case "flyout":
      const priority = EXTs.filter((ext) => list.includes(ext));
      const remainder = list.filter((ext) => !priority.includes(ext as any));
      const insert = [{ type: "delimiter" }, "/", { type: "delimiter" }];
      return [...priority, ...insert, ...remainder];
  }
}

export function NewFileDropdown({
  create_file,
  mode = "project",
  showDown = true,
  title,
  button = true,
  cacheKey = "",
}: Props) {
  const intl = useIntl();

  title ??= intl.formatMessage({
    id: "project.new.new-file-dropdown.label",
    defaultMessage: "More File Types...",
    description:
      "Label on a button to create one of several additional file types",
  });

  // TODO maybe filter by configuration.get("main", {disabled_ext: undefined}) ?
  const items = React.useMemo((): MenuItems => {
    const list = makeList(mode);
    const extensions: (string | { type: "divider" })[] = [];
    const file_types_so_far = {};
    for (const ext of list) {
      if (typeof ext !== "string") {
        extensions.push({ type: "divider" });
        continue;
      }
      if (ext === "/") {
        extensions.push(ext);
        continue;
      }
      const data = file_associations[ext];
      if (data.exclude_from_menu) continue;
      if (data.name != undefined && !file_types_so_far[data.name]) {
        file_types_so_far[data.name] = true;
        extensions.push(ext);
      }
    }
    return extensions.map(dropdown_item);
  }, [...keys(file_associations), mode, cacheKey]);

  function dropdown_item(ext: string | { type: "divider" }) {
    if (typeof ext !== "string") {
      return ext;
    }

    const data =
      ext === "/"
        ? {
            name: "Folder",
            icon: "folder-open",
          }
        : file_options("x." + ext);

    const text = (
      <>
        <span style={{ width: "25px", display: "inline-block" }}>
          {data.icon && <Icon name={data.icon} />}
        </span>
        <span style={{ textTransform: "capitalize" }}>
          {data.name ? data.name : "No Extension"}
        </span>{" "}
        {ext && ext !== "/" ? (
          <span style={{ color: COLORS.GRAY }}>(.{ext})</span>
        ) : undefined}
      </>
    );

    return {
      key: ext,
      onClick: () => create_file(ext),
      label: text,
    };
  }

  switch (mode) {
    case "project":
      return (
        <span
          className={"pull-right dropdown-splitbutton-left"}
          style={{ marginRight: "5px" }}
        >
          <Button.Group>
            <Button size="large" onClick={() => create_file()}>
              <span>
                <Icon name="file" /> {title}
              </span>
            </Button>

            <DropdownMenu size="large" button={button} items={items} />
          </Button.Group>
        </span>
      );
    case "flyout":
      return (
        <DropdownMenu
          title={title ? title : "No Extension"}
          size="medium"
          button={button}
          items={items}
          showDown={showDown}
          style={{ width: "100%" }}
        />
      );
  }
}
