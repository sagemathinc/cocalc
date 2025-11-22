/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, type MenuProps, Space } from "antd";
import { useIntl } from "react-intl";
import { DropdownMenu, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { COLORS } from "@cocalc/util/theme";
import { EXTs as ALL_FILE_BUTTON_TYPES } from "./file-listing/utils";
import { file_options } from "@cocalc/frontend/editor-tmp";

interface Props {
  file_search: string;
  current_path: string;
  actions: ProjectActions;
  create_folder: (switch_over?: boolean) => void;
  create_file: (ext?: string, switch_over?: boolean) => void;
  configuration?;
  disabled: boolean;
}

export const NewButton: React.FC<Props> = ({
  file_search = "",
  actions,
  create_folder,
  create_file,
  configuration,
  disabled,
}: Props) => {
  const intl = useIntl();

  function new_file_button_types() {
    if (configuration != undefined) {
      const { disabled_ext } = configuration.get("main", {
        disabled_ext: undefined,
      });
      if (disabled_ext != undefined) {
        return ALL_FILE_BUTTON_TYPES.filter(
          (ext) => !disabled_ext.includes(ext),
        );
      }
    }
    return ALL_FILE_BUTTON_TYPES;
  }

  function file_dropdown_icon(): React.JSX.Element {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <Icon name="plus-circle" /> {intl.formatMessage(labels.new)}
      </span>
    );
  }

  function file_dropdown_item(ext: string) {
    const data = file_options("x." + ext);
    return {
      key: ext,
      onClick: () => on_dropdown_entry_clicked(ext),
      label: (
        <span style={{ whiteSpace: "nowrap" }}>
          <Icon name={data.icon} />{" "}
          <span style={{ textTransform: "capitalize" }}>{data.name} </span>{" "}
          <span style={{ color: COLORS.GRAY_D }}>(.{ext})</span>
        </span>
      ),
    };
  }

  function choose_extension(ext: string): void {
    if (file_search.length === 0) {
      // Tell state to render an error in file search
      actions.ask_filename(ext);
    } else {
      create_file(ext);
    }
  }

  function on_create_folder_button_clicked(): void {
    if (file_search.length === 0) {
      actions.ask_filename("/");
    } else {
      create_folder();
    }
  }

  function on_dropdown_entry_clicked(key: string) {
    switch (key) {
      case "folder":
        on_create_folder_button_clicked();
        break;
      default:
        choose_extension(key);
    }
  }

  // Go to new file tab if no file is specified
  function on_create_button_clicked(): void {
    if (file_search.length === 0) {
      actions.set_active_tab("new");
    } else if (file_search[file_search.length - 1] === "/") {
      create_folder();
    } else {
      create_file();
    }
  }

  const items: MenuProps["items"] = [
    ...new_file_button_types().map(file_dropdown_item),
    { type: "divider" },
    {
      key: "folder",
      onClick: () => on_dropdown_entry_clicked("folder"),
      label: (
        <span style={{ whiteSpace: "nowrap" }}>
          <Icon name="folder" /> {intl.formatMessage(labels.folder)}
        </span>
      ),
    },
  ];

  return (
    <Space.Compact>
      <Button onClick={on_create_button_clicked} disabled={disabled}>
        {file_dropdown_icon()}{" "}
      </Button>

      <DropdownMenu title={""} button={true} items={items} />
    </Space.Compact>
  );
};
