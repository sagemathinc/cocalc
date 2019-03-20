import * as React from "react";
const {
  Alert,
  Button,
  ButtonToolbar,
  Row,
  Col
} = require("react-bootstrap");

const { Icon } = require("../../r_misc");

import * as misc from "smc-util/misc";

export function Delete({
  selected_files_display,
  current_path,
  size,
  on_delete,
  on_cancel,
  open_snapshots
}) {
  return (
    <div>
      <Row>
        <Col sm={5} style={{ color: "#666" }}>
          {selected_files_display}
        </Col>
        <DeleteWarning current_path={current_path} />
      </Row>
      <Row style={{ marginBottom: "10px" }}>
        <Col sm={12}>
          Deleting a file immediately deletes it from disk freeing up space;
          however, older backups of your files may still be available in the{" "}
          <a href="" onClick={open_snapshots}>
            ~/.snapshots
          </a>{" "}
          directory.
        </Col>
      </Row>
      <Row>
        <Col sm={12}>
          <ButtonToolbar>
            <Button
              bsStyle="danger"
              onClick={on_delete}
              disabled={current_path === ".trash"}
            >
              <Icon name="trash-o" /> Delete {size} {misc.plural(size, "Item")}
            </Button>
            <Button onClick={on_cancel}>Cancel</Button>
          </ButtonToolbar>
        </Col>
      </Row>
    </div>
  );
}

function DeleteWarning({ current_path }: { current_path: string }) {
  if (current_path === ".trash") {
    return (
      <Col sm={5}>
        <Alert bsStyle="danger">
          <h4>
            <Icon name="exclamation-triangle" /> Notice
          </h4>
          <p>Your files have already been moved to the trash.</p>
        </Alert>
      </Col>
    );
  } else {
    return null;
  }
}
