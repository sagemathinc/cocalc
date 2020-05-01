/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  Component,
  Rendered,
  rtypes,
  redux,
  rclass,
} from "../../app-framework";

import { Card } from "antd";

import { Checkbox } from "../../antd-bootstrap";

import { Icon, NumberInput } from "../../r_misc";

import { CourseActions } from "../actions";

import { ConfigurationActions } from "../configuration/actions";

import {
  NBGRADER_CELL_TIMEOUT_MS,
  NBGRADER_TIMEOUT_MS,
} from "../assignments/actions";

interface Props {
  name: string;

  // redux Props
  settings?: any;
}

class Nbgrader extends Component<Props> {
  private actions: ConfigurationActions;

  constructor(props) {
    super(props);
    const actions: CourseActions = redux.getActions(this.props.name);
    if (actions == null) throw Error("bug");
    this.actions = actions.configuration;
  }
  static reduxProps({ name }) {
    return {
      [name]: { settings: rtypes.immutable.Map },
    };
  }

  private render_grade_in_instructor_project(): Rendered {
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <Checkbox
          checked={this.props.settings?.get(
            "nbgrader_grade_in_instructor_project"
          )}
          onChange={(e) =>
            this.actions.set_nbgrader_grade_in_instructor_project(
              (e.target as any).checked
            )
          }
        >
          Grade in instructor project: run autograding in the instructor's
          project instead of the student's projects; less secure, but it doesn't
          require starting the student projects, and the instructor project may
          have much more memory.
        </Checkbox>
      </div>
    );
  }

  private render_timeouts(): Rendered {
    const timeout = Math.round(
      this.props.settings.get("nbgrader_timeout_ms", NBGRADER_TIMEOUT_MS) / 1000
    );
    const cell_timeout = Math.round(
      this.props.settings.get(
        "nbgrader_cell_timeout_ms",
        NBGRADER_CELL_TIMEOUT_MS
      ) / 1000
    );
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        Grading timeout in seconds: if grading a student notebook takes longer
        than <i>{timeout} seconds</i>, then it is terminated with a timeout
        error.
        <NumberInput
          on_change={(n) => this.actions.set_nbgrader_timeout_ms(n * 1000)}
          min={30}
          max={3600}
          number={timeout}
        />
        Cell grading timeout in seconds: if grading a cell in a student notebook
        takes longer than <i>{cell_timeout} seconds</i>, then that cell is
        terminated with a timeout error.
        <NumberInput
          on_change={(n) =>
            this.actions.set_nbgrader_cell_timeout_ms(
              Math.min(n * 1000, timeout * 1000)
            )
          }
          min={5}
          max={3600}
          number={cell_timeout}
        />
      </div>
    );
  }
  render(): Rendered {
    return (
      <Card
        title={
          <>
            <Icon name="graduation-cap" /> Nbgrader
          </>
        }
      >
        {this.render_grade_in_instructor_project()}
        <br />
        {this.render_timeouts()}
      </Card>
    );
  }
}

const tmp = rclass(Nbgrader);
export { tmp as Nbgrader };
