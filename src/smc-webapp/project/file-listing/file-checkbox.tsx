import * as React from "react";

import { ProjectActions } from "../../project_actions";

const { Icon } = require("../../r_misc");
const misc = require("smc-util/misc");

interface Props {
  name?: string;
  checked?: boolean;
  actions: ProjectActions;
  current_path?: string;
  style?: React.CSSProperties;
}

export class FileCheckbox extends React.PureComponent<Props> {
  handle_click = e => {
    e.stopPropagation(); // so we don't open the file
    const full_name = misc.path_to_file(
      this.props.current_path,
      this.props.name
    );
    if (e.shiftKey) {
      this.props.actions.set_selected_file_range(
        full_name,
        !this.props.checked
      );
    } else {
      this.props.actions.set_file_checked(full_name, !this.props.checked);
    }
    this.props.actions.set_most_recent_file_click(full_name);
  };

  render() {
    return (
      <span onClick={this.handle_click} style={this.props.style}>
        <Icon
          name={this.props.checked ? "check-square-o" : "square-o"}
          fixedWidth
          style={{ fontSize: "14pt" }}
        />
      </span>
    );
  }
}
