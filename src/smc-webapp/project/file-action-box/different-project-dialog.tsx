import * as React from "react";

const { Checkbox, Col } = require("react-bootstrap");
const { Loading } = require("../../r_misc");

const Combobox = require("react-widgets/lib/Combobox"); // TODO: delete this when the combobox is in r_misc

export function DifferentProjectDialog({
  get_project_select_list,
  on_select,
  project_id,
  public_view,
  copy_destination_project_id,
  on_check_delete_extra,
  on_check_overwrite_newer
}) {
  const data = get_project_select_list(project_id);
  if (data == null) {
    return <Loading />;
  }
  return (
    <Col sm={4} style={col_style}>
      <h4>In the project</h4>
      <Combobox
        valueField="id"
        textField="title"
        data={data}
        filter="contains"
        defaultValue={!public_view ? project_id : undefined}
        placeholder="Select a project..."
        onSelect={on_select}
        messages={messages}
      />
      {project_id !== copy_destination_project_id && (
        <div>
          <Checkbox onChange={on_check_delete_extra}>
            Delete extra files in target directory
          </Checkbox>
          <Checkbox onChange={on_check_overwrite_newer}>
            Overwrite newer versions of files
          </Checkbox>
        </div>
      )}
    </Col>
  );
}

const messages = { emptyFilter: "", emptyList: "" };

const col_style = { color: "#666", marginBottom: "15px" };
