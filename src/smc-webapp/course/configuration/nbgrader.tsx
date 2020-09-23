/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, redux, useRedux, useActions } from "../../app-framework";
import { Card, Radio } from "antd";
import { Checkbox } from "../../antd-bootstrap";
import { A, Icon, NumberInput } from "../../r_misc";
import { SelectProject } from "../../projects/select-project";

import { CourseActions } from "../actions";
import {
  NBGRADER_CELL_TIMEOUT_MS,
  NBGRADER_TIMEOUT_MS,
} from "../assignments/actions";

const radioStyle: CSS = {
  display: "block",
  whiteSpace: "normal",
  fontWeight: "inherit",
};

interface Props {
  name: string;
}

export const Nbgrader: React.FC<Props> = ({ name }) => {
  const settings = useRedux([name, "settings"]);
  const course_project_id = useRedux([name, "course_project_id"]);
  const actions: CourseActions = useActions({ name });
  if (actions == null) {
    throw Error("bug");
  }

  function render_grade_project(): JSX.Element {
    const location = settings?.get("nbgrader_grade_project")
      ? "project"
      : "student";
    return (
      <div
        style={{
          border: "1px solid lightgrey",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <h6>Where to autograde assignments</h6>
        <Radio.Group
          onChange={(e) => {
            if (e.target.value == "student") {
              actions.configuration.set_nbgrader_grade_project("");
            } else {
              actions.configuration.set_nbgrader_grade_project(
                course_project_id
              );
            }
          }}
          value={location}
        >
          <Radio value={"student"} key={"student"} style={radioStyle}>
            Grade assignments in each student's own project
          </Radio>
          <Radio value={"project"} key={"project"} style={radioStyle}>
            Grade assignments in a project of your choice
          </Radio>
        </Radio.Group>
        <br />
        {location == "project" && (
          <div>
            <SelectProject
              style={{ width: "100%", padding: "5px 25px" }}
              onChange={actions.configuration.set_nbgrader_grade_project}
              value={settings?.get("nbgrader_grade_project")}
            />
            {settings?.get("nbgrader_grade_project") &&
              settings?.get("nbgrader_grade_project") != course_project_id && (
                <a
                  style={{ marginLeft: "25px" }}
                  onClick={() =>
                    redux.getActions("projects").open_project({
                      project_id: settings?.get("nbgrader_grade_project"),
                      switch_to: true,
                    })
                  }
                >
                  Open grading project...
                </a>
              )}
          </div>
        )}
        <hr />
        Where to grade: choose the project in which to run autograding. We
        recommend that you create a new project dedicated to running nbgrader,
        upgrade or license it appropriately, and copy any files to it that
        student work depends on. You can also grade all student work in the
        student's own project, which is good because the code runs in the same
        environment as the student work (and won't harm any files you have), but
        can be significantly slower since each student project has too be
        running.
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
        <h6>Hidden tests</h6>
        <Checkbox
          checked={settings?.get("nbgrader_include_hidden_tests")}
          onChange={(e) =>
            actions.configuration.set_nbgrader_include_hidden_tests(
              (e.target as any).checked
            )
          }
        >
          Include the hidden tests in autograded notebooks returned to students.
          Select this if you want the students to see why their answers failed
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
        <h6>Timeouts</h6>
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
        <A href="https://doc.cocalc.com/teaching-nbgrader.html">
          <Icon name="graduation-cap" /> Nbgrader
        </A>
      }
    >
      {render_grade_project()}
      <br />
      {render_include_hidden_tests()}
      <br />
      {render_timeouts()}
    </Card>
  );
};
