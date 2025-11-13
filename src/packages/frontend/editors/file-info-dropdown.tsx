/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// info button inside the editor when editing a file. links you back to the file listing with the action prompted

import { createRoot } from "react-dom/client";

import { CSS, React, useActions } from "@cocalc/frontend/app-framework";
import { DropdownMenu, Icon, IconName } from "@cocalc/frontend/components";
import { MenuItems } from "@cocalc/frontend/components/dropdown-menu";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_actions } from "@cocalc/frontend/project_store";
import { capitalize, filename_extension } from "@cocalc/util/misc";

interface Props {
  filename: string; // expects the full path name
  project_id: string;
  is_public?: boolean;
  style?: CSS;
  button?: boolean;
  mode?: "explorer" | "flyout";
}

const EditorFileInfoDropdown: React.FC<Props> = React.memo(
  (props: Props) => {
    const {
      filename,
      project_id,
      is_public,
      style,
      button,
      mode = "explorer",
    } = props;
    const actions = useActions({ project_id });
    const student_project_functionality =
      useStudentProjectFunctionality(project_id);
    if (student_project_functionality.disableActions) {
      return <span></span>;
    }

    function handle_click(name) {
      if (actions == null) {
        console.warn("file click -- actions not available");
        return;
      }
      if (name === "new") {
        let new_ext: string | undefined = filename_extension(filename);
        if (new_ext == "") {
          // otherwise 'foo' leads to 'random.'
          new_ext = undefined;
        }
        // Special calse -- not an action on this one file
        actions.set_active_tab("new", { new_ext });
        return;
      }
      for (const key in file_actions) {
        if (key === name) {
          actions.show_file_action_panel({
            path: filename,
            action: key,
          });
          break;
        }
      }
    }

    function render_menu_item(key: string, icon: IconName): MenuItems[0] {
      return {
        key,
        onClick: () => handle_click(key),
        label: (
          <>
            <Icon name={icon} style={{ width: "25px" }} /> {capitalize(key)}
          </>
        ),
      };
    }

    function render_menu_items(): MenuItems {
      let items: { [key: string]: IconName };
      const v: MenuItems = [];
      if (is_public) {
        // Fewer options when viewing the action dropdown in public mode:
        items = {
          download: "cloud-download",
          copy: "files",
        };
      } else {
        if (mode !== "flyout") {
          v.push(render_menu_item("new", "plus-circle"));
        }
        // create a map from name to icon
        items = {};
        for (const key in file_actions) {
          const { icon, hideFlyout } = file_actions[key];
          if (mode === "flyout" && hideFlyout) continue;
          items[key] = icon;
        }
      }

      for (let key in items) {
        const icon = items[key];
        v.push(render_menu_item(key, icon));
      }
      return v;
    }

    return (
      <DropdownMenu
        button={button}
        style={{ ...{ height: "100%" }, ...style }}
        id="file_info_button"
        title={"File"}
        items={render_menu_items()}
      />
    );
  },
  (prev, next) =>
    prev.filename == next.filename && prev.is_public == next.is_public,
);

// This is for sage worksheets...
export function render_file_info_dropdown(
  filename: string,
  project_id: string,
  dom_node,
  is_public?,
) {
  const root = createRoot(dom_node);
  root.render(
    <EditorFileInfoDropdown
      filename={filename}
      project_id={project_id}
      is_public={is_public}
      style={{ height: "34px" }}
    />,
  );
}
