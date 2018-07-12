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

import { React, rclass, rtypes } from "../app-framework";
import { Button, ButtonToolbar, Panel, Well } from "react-bootstrap";
import { Icon } from "../r_misc";

export let DeleteStudentsPanel = rclass({
  propTypes: {
    delete: rtypes.func.isRequired
  },

  getInitialState() {
    return { delete_student_projects_confirm: false };
  },

  render_confirm_delete_student_projects() {
    return (
      <Well style={{ marginTop: "10px" }}>
        All student projects will be deleted and are no longer accessible by the
        student. (You will still have access to the deleted projects in the
        Projects page.) Are you absolutely sure?
        <ButtonToolbar style={{ marginTop: "10px" }}>
          <Button
            bsStyle="danger"
            onClick={() => {
              this.setState({ delete_student_projects_confirm: false });
              return this.props.delete();
            }}
          >
            YES, DELETE all Student Projects
          </Button>
          <Button
            onClick={() =>
              this.setState({ delete_student_projects_confirm: false })
            }
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </Well>
    );
  },

  render() {
    return (
      <Panel
        header={
          <h4>
            <Icon name="trash" /> Delete all student projects
          </h4>
        }
      >
        <Button
          bsStyle="danger"
          onClick={() =>
            this.setState({ delete_student_projects_confirm: true })
          }
        >
          <Icon name="trash" /> Delete all Student Projects...
        </Button>
        {this.state.delete_student_projects_confirm
          ? this.render_confirm_delete_student_projects()
          : undefined}
        <hr />
        <span style={{ color: "#666" }}>
          If for some reason you would like to delete all the student projects
          created for this course, you may do so by clicking above. Be careful!<br />
          Students will be removed from the deleted projects.
        </span>
      </Panel>
    );
  }
});
