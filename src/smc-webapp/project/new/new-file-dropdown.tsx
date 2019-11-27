import * as React from "react";
import { Icon } from "../../r_misc";
import { SplitButton, MenuItem } from "react-bootstrap";
import { file_associations } from "../../file-associations";
import * as misc from "smc-util/misc";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { file_options } = require("../../editor");

interface Props {
  create_file: (ext?: string) => void;
}

const file_type_list = function(list: string[], exclude: boolean): string[] {
  const extensions: string[] = [];
  const file_types_so_far = {};
  for (const ext of list) {
    if (!ext) {
      continue;
    }
    const data = file_associations[ext];
    if (exclude && data.exclude_from_menu) {
      continue;
    }
    if (data.name != undefined && !file_types_so_far[data.name]) {
      file_types_so_far[data.name] = true;
      extensions.push(ext);
    }
  }
  return extensions;
};

function ButtonIcon(): JSX.Element {
  return (
    <span>
      <Icon name="file" /> File
    </span>
  );
}

function FileDropDownItem({
  ext,
  on_select
}: {
  ext: string;
  on_select: () => void;
}): JSX.Element {
  const data = file_options("x." + ext);
  const text = (
    <>
      <span style={{ textTransform: "capitalize" }}>{data.name}</span>
      <span style={{ color: "#666" }}>(.{ext})</span>
    </>
  );
  return (
    <MenuItem className={"dropdown-menu-left"} onSelect={on_select}>
      <Icon name={data.icon} /> {text}
    </MenuItem>
  );
}

export const NewFileDropdown = React.memo(function NewFileDropdown({
  create_file
}: Props) {
  const new_file_button_types = file_type_list(
    misc.keys(file_associations).sort(),
    true
  );

  const dropdown_buttons: JSX.Element[] = [];
  for (const i in new_file_button_types) {
    const ext = new_file_button_types[i];
    dropdown_buttons.push(
      <FileDropDownItem
        key={i}
        ext={ext}
        on_select={(): void => {
          create_file(ext);
        }}
      />
    );
  }

  return (
    <span
      className={"pull-right dropdown-splitbutton-left"}
      style={{ marginRight: "5px" }}
    >
      <SplitButton
        id={"new_file_dropdown"}
        title={<ButtonIcon />}
        onClick={(): void => {
          create_file();
        }}
      >
        {dropdown_buttons}
      </SplitButton>
    </span>
  );
});
