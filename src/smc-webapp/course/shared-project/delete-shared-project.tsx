/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React } from "../../app-framework";
import { Button, ButtonGroup, Well } from "../../antd-bootstrap";
import { Card } from "antd";
import { Icon } from "../../r_misc";

interface DeleteSharedProjectPanelProps {
  delete: () => void;
}

interface DeleteSharedProjectPanelState {
  delete_shared_projects_confirm: boolean;
}

export class DeleteSharedProjectPanel extends Component<
  DeleteSharedProjectPanelProps,
  DeleteSharedProjectPanelState
> {
  constructor(props) {
    super(props);
    this.state = { delete_shared_projects_confirm: false };
  }

  render_confirm_delete_shared_projects() {
    return (
      <Well style={{ marginTop: "10px" }}>
        The shared project will be deleted and all students removed from it.
        (You will still have access to the deleted shared project in the
        Projects page.) Are you absolutely sure?
        <ButtonGroup style={{ marginTop: "10px" }}>
          <Button
            bsStyle="danger"
            onClick={() => {
              this.setState({ delete_shared_projects_confirm: false });
              return this.props.delete();
            }}
          >
            YES, DELETE the Shared Project
          </Button>
          <Button
            onClick={() =>
              this.setState({ delete_shared_projects_confirm: false })
            }
          >
            Cancel
          </Button>
        </ButtonGroup>
      </Well>
    );
  }

  render() {
    return (
      <Card
        title={
          <>
            <Icon name="trash" /> Delete shared project
          </>
        }
      >
        <Button
          bsStyle="danger"
          onClick={() =>
            this.setState({ delete_shared_projects_confirm: true })
          }
        >
          <Icon name="trash" /> Delete Shared Project...
        </Button>
        {this.state.delete_shared_projects_confirm
          ? this.render_confirm_delete_shared_projects()
          : undefined}
        <hr />
        <span style={{ color: "#666" }}>
          If for some reason you would like to delete the shared projects that
          you created for this course, you may do so by clicking above. Be
          careful!
          <br />
          All students will be removed from the deleted shared projects.
        </span>
      </Card>
    );
  }
}
