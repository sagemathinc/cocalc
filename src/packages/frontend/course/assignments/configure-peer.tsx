/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Panel for configuring peer grading.
*/

import { Button, Checkbox } from "@cocalc/frontend/antd-bootstrap";
import { React, Rendered } from "@cocalc/frontend/app-framework";
import {
  DateTimePicker,
  Icon,
  MarkdownInput,
  NumberInput,
  Tip,
} from "@cocalc/frontend/components";
// import { server_days_ago } from "@cocalc/util/misc";
import { Card, Col, Row } from "antd";
import { CourseActions } from "../actions";
import { AssignmentRecord } from "../store";

interface Props {
  assignment: AssignmentRecord;
  actions: CourseActions;
}

export const ConfigurePeerGrading: React.FC<Props> = React.memo(
  (props: Props) => {
    const { assignment, actions } = props;

    function render_configure_peer_checkbox(config): Rendered {
      return (
        <Checkbox
          checked={config.enabled != null ? config.enabled : false}
          key="peer_grade_checkbox"
          onChange={(e) =>
            set_peer_grade({ enabled: (e.target as any).checked })
          }
          style={{ display: "inline-block", verticalAlign: "middle" }}
        >
          Enable Peer Grading
        </Checkbox>
      );
    }

    function peer_due(date): Date | undefined {
      if (date != null) {
        return new Date(date);
      }
      // there was fallback code to set this to server_days_ago(-7), but this was never actually used, hence disabled
    }

    function set_peer_grade(config) {
      actions.assignments.set_peer_grade(
        assignment.get("assignment_id"),
        config
      );
    }

    function peer_due_change(date) {
      const due_date = peer_due(date);
      set_peer_grade({
        due_date: due_date?.toISOString(),
      });
    }

    function render_configure_peer_due(config): Rendered {
      const label = (
        <Tip
          placement="top"
          title="Set the due date"
          tip="Set the due date for grading this assignment.  Note that you must explicitly click a button to collect graded assignments when -- they are not automatically collected on the due date.  A file is included in the student peer grading assignment telling them when they should finish their grading."
        >
          Due
        </Tip>
      );
      return (
        <Row>
          <Col span={12}>{label}</Col>
          <Col span={12}>
            <DateTimePicker
              placeholder={"Set Peer Grading Due Date"}
              value={peer_due(config.due_date)}
              onChange={peer_due_change}
            />
          </Col>
        </Row>
      );
    }

    function render_configure_peer_number(config): Rendered {
      const store = actions.get_store();
      const maxVal = (store?.num_students() ?? 2) - 1;
      return (
        <Row>
          <Col span={12}>Number of students who will grade each assignment</Col>
          <Col span={12}>
            <NumberInput
              on_change={(n) => set_peer_grade({ number: n })}
              min={1}
              max={maxVal}
              number={config.number != null ? config.number : 1}
            />
          </Col>
        </Row>
      );
    }

    function render_configure_grading_guidelines(config): Rendered {
      return (
        <div style={{ marginTop: "10px" }}>
          <Row>
            <Col span={12}>
              Grading guidelines, which will be made available to students in
              their grading folder in a file GRADING_GUIDE.md. Tell your
              students how to grade each problem. Since this is a markdown file,
              you might also provide a link to a publicly shared file or
              directory with guidelines.
            </Col>
            <Col span={12}>
              <div
                style={{
                  background: "white",
                  padding: "10px",
                  border: "1px solid #ccc",
                  borderRadius: "3px",
                }}
              >
                <MarkdownInput
                  persist_id={
                    assignment.get("path") +
                    assignment.get("assignment_id") +
                    "grading-guidelines"
                  }
                  attach_to={actions.name}
                  rows={16}
                  placeholder="Enter your grading guidelines for this assignment..."
                  default_value={config.guidelines}
                  on_save={(x) => set_peer_grade({ guidelines: x })}
                />
              </div>
            </Col>
          </Row>
        </div>
      );
    }

    function render_configure_grid(config): Rendered {
      return (
        <div>
          {render_configure_peer_number(config)}
          {render_configure_peer_due(config)}
          {render_configure_grading_guidelines(config)}
        </div>
      );
    }

    const peer_info = assignment.get("peer_grade");
    let config: { enabled?: boolean } = {};
    if (peer_info) {
      config = peer_info.toJS();
    }
    return (
      <Card
        style={{ background: "#fcf8e3", whiteSpace: "normal" }}
        title={
          <h3>
            <Icon name="users" /> Peer grading
          </h3>
        }
      >
        <div style={{ color: "#666" }}>
          Use peer grading to randomly (and anonymously) redistribute collected
          homework to your students, so that they can grade it for you.
        </div>

        {render_configure_peer_checkbox(config)}
        {config.enabled ? render_configure_grid(config) : undefined}
        <Button
          onClick={() =>
            actions.toggle_item_expansion(
              "peer_config",
              assignment.get("assignment_id")
            )
          }
        >
          Close
        </Button>
      </Card>
    );
  }
);
