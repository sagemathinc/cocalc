/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux, useActions } from "../../app-framework";
import { Card } from "antd";
import { Checkbox } from "../../antd-bootstrap";
import { Icon, NumberInput } from "../../r_misc";
import { CourseActions } from "../actions";
import {
  NBGRADER_CELL_TIMEOUT_MS,
  NBGRADER_TIMEOUT_MS,
} from "../assignments/actions";

interface Props {
  name: string;
}

export const Nbgrader: React.FC<Props> = ({ name }) => {
  const settings = useRedux([name, "settings"]);
  const actions: CourseActions = useActions({ name });
  if (actions == null) {
    throw Error("bug");
  }

  function render_grade_in_instructor_project(): JSX.Element {
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <Checkbox
          checked={settings?.get("nbgrader_grade_in_instructor_project")}
          onChange={(e) =>
            actions.configuration.set_nbgrader_grade_in_instructor_project(
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

  function render_include_hidden_tests(): JSX.Element {
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <Checkbox
          checked={settings?.get("nbgrader_include_hidden_tests")}
          onChange={(e) =>
            actions.configuration.set_nbgrader_include_hidden_tests(
              (e.target as any).checked
            )
          }
        >
          Include the hidden tests in autograded notebooks returned to students.
          Check this if you want the students to see why their answers failed
          your hidden tests. The drawback is that you've revealed all the hidden
          tests to the students.
        </Checkbox>
      </div>
    );
  }

  function render_timeouts(): JSX.Element {
    const timeout = Math.round(
      settings.get("nbgrader_timeout_ms", NBGRADER_TIMEOUT_MS) / 1000
    );
    const cell_timeout = Math.round(
      settings.get("nbgrader_cell_timeout_ms", NBGRADER_CELL_TIMEOUT_MS) / 1000
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
          on_change={(n) =>
            actions.configuration.set_nbgrader_timeout_ms(n * 1000)
          }
          min={30}
          max={3600}
          number={timeout}
        />
        Cell grading timeout in seconds: if grading a cell in a student notebook
        takes longer than <i>{cell_timeout} seconds</i>, then that cell is
        terminated with a timeout error.
        <NumberInput
          on_change={(n) =>
            actions.configuration.set_nbgrader_cell_timeout_ms(
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

  return (
    <Card
      title={
        <>
          <Icon name="graduation-cap" /> Nbgrader
        </>
      }
    >
      {render_grade_in_instructor_project()}
      <br />
      {render_include_hidden_tests()}
      <br />
      {render_timeouts()}
    </Card>
  );
};
