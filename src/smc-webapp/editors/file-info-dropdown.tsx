/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// info button inside the editor when editing a file. links you back to the file listing with the action prompted
import { CSS, React, ReactDOM, useActions } from "../app-framework";
import { capitalize, filename_extension } from "smc-util/misc";
import { file_actions } from "../project_store";
import { DropdownMenu, MenuItem, Icon, Space } from "../r_misc";

interface Props {
  filename: string; // expects the full path name
  project_id: string;
  is_public?: boolean;
  label?: string;
  style?: CSS;
}

export const EditorFileInfoDropdown: React.FC<Props> = React.memo(
  ({ filename, project_id, is_public, label, style }) => {
    const actions = useActions({ project_id });

    function handle_click(name) {
      if (name === "new") {
        let new_ext = filename_extension(filename);
        if (new_ext == "") {
          // otherwise 'foo' leads to 'random.'
          new_ext = undefined;
        }
        // Special calse -- not an action on this one file
        actions?.set_active_tab("new", { new_ext });
        return;
      }
      for (const action in file_actions) {
        const v = file_actions[action];
        if (v?.name == name) {
          actions?.show_file_action_panel({
            path: filename,
            action,
          });
          break;
        }
      }
    }

    function render_menu_item(name: string, icon: string): JSX.Element {
      return (
        <MenuItem onSelect={() => handle_click(name)} key={name}>
          <Icon name={icon} fixedWidth /> {`${capitalize(name)}...`}
        </MenuItem>
      );
    }

    function render_menu_items() {
      let items: { [key: string]: string };
      const v: JSX.Element[] = [];
      if (is_public) {
        // Fewer options when viewing the action dropdown in public mode:
        items = {
          download: "cloud-download",
          copy: "files-o",
        };
      } else {
        v.push(render_menu_item("new", "plus-circle"));
        // create a map from name to icon
        items = {};
        for (const k in file_actions) {
          const { name, icon } = file_actions[k];
          items[name] = icon;
        }
      }

      for (let name in items) {
        const icon = items[name];
        v.push(render_menu_item(name, icon));
      }
      return v;
    }

    function render_title() {
      return (
        <span>
          <span className={"hidden-xs"}>
            <Icon name={"file"} /> {label ?? ""}
            <Space />
          </span>
        </span>
      );
    }

    return (
      <DropdownMenu
        button={true}
        hide_down={!label}
        style={style}
        id="file_info_button"
        title={render_title()}
      >
        {render_menu_items()}
      </DropdownMenu>
    );
  },
  (prev, next) =>
    prev.filename == next.filename && prev.is_public == next.is_public
);

export function render_file_info_dropdown(
  filename: string,
  project_id: string,
  dom_node,
  is_public?
) {
  return ReactDOM.render(
    <EditorFileInfoDropdown
      filename={filename}
      project_id={project_id}
      is_public={is_public}
      label={"File"}
      style={{ height: "34px" }}
    />,
    dom_node
  );
}
