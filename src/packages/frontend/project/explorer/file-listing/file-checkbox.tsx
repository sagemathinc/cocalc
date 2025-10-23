/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ProjectActions } from "@cocalc/frontend/project_actions";
import { Icon } from "@cocalc/frontend/components";
import { path_to_file } from "@cocalc/util/misc";

interface Props {
  name: string;
  checked: boolean;
  actions: ProjectActions;
  current_path: string;
  style?: React.CSSProperties;
  listing;
}

export function FileCheckbox({
  name,
  checked,
  actions,
  current_path,
  style,
  listing,
}: Props) {
  function handle_click(e) {
    e.stopPropagation(); // so we don't open the file
    const full_name = path_to_file(current_path, name);
    if (e.shiftKey) {
      actions.set_selected_file_range(full_name, !checked, listing);
    } else {
      actions.set_file_checked(full_name, !checked);
    }
    actions.set_most_recent_file_click(full_name);
  }

  return (
    <span onClick={handle_click} style={style}>
      <Icon
        name={checked ? "check-square-o" : "square-o"}
        style={{ fontSize: "14pt", width: "1.125em" }}
      />
    </span>
  );
}
