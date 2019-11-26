/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016 -- 2017, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//#############################################################################

import { Component, React } from "../app-framework";
const { Button, ButtonToolbar, Well } = require("react-bootstrap");
import { Card } from "cocalc-ui";
import { Icon } from "../r_misc";

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
        <ButtonToolbar style={{ marginTop: "10px" }}>
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
        </ButtonToolbar>
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
