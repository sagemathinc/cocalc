/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Panel for configuring peer grading.
*/

import { React, Rendered } from "@cocalc/frontend/app-framework";
import {
  DateTimePicker,
  Icon,
  MarkdownInput,
} from "@cocalc/frontend/components";
import { server_days_ago } from "@cocalc/util/misc";
import { Button, Card, Col, InputNumber, Row, Switch, Typography } from "antd";
import { CourseActions } from "../actions";
import { AssignmentRecord } from "../store";
import { PEER_GRADING_GUIDE_FN } from "./consts";

interface Props {
  assignment: AssignmentRecord;
  actions: CourseActions;
}

export const ConfigurePeerGrading: React.FC<Props> = React.memo(
  (props: Props) => {
    const { assignment, actions } = props;

    const peer_info = assignment.get("peer_grade");
    const config: { enabled: boolean; number: number } = {
      number: 1,
      enabled: false,
      ...peer_info?.toJS(),
    };

    function render_configure_peer_checkbox(config): Rendered {
      return (
        <Row style={{ marginTop: "10px" }}>
          <Col span={12}>
            <Switch
              checked={config.enabled}
              onChange={(checked) => set_peer_grade({ enabled: checked })}
              style={{ display: "inline-block", verticalAlign: "middle" }}
            />
          </Col>
          <Col span={12}>Enable Peer Grading</Col>
        </Row>
      );
    }

    function peer_due(date): Date | undefined {
      if (date != null) {
        return new Date(date);
      } else {
        return server_days_ago(-7);
      }
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
        <Typography.Paragraph
          ellipsis={{ expandable: true, rows: 1, symbol: "more info" }}
        >
          Due date:{" "}
          <Typography.Text type={"secondary"}>
            Set the due date for grading this assignment. Note: you must
            explicitly click a button to collect graded assignments – they are
            not automatically collected on the due date. A file is included in
            the student peer grading assignment telling them when they should
            finish their grading.
          </Typography.Text>
        </Typography.Paragraph>
      );
      return (
        <Row style={{ marginTop: "10px" }}>
          <Col span={12}>{label}</Col>
          <Col span={12}>
            <DateTimePicker
              style={{ width: "100%" }}
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
        <Row style={{ marginTop: "10px" }}>
          <Col span={12}>Number of students who will grade each assignment</Col>
          <Col span={12}>
            <InputNumber
              onChange={(n) => set_peer_grade({ number: n })}
              min={1}
              max={maxVal}
              value={config.number}
            />
          </Col>
        </Row>
      );
    }

    function render_configure_grading_guidelines(config): Rendered {
      return (
        <Row style={{ marginTop: "10px" }}>
          <Col span={12}>
            <Typography.Paragraph
              ellipsis={{ expandable: true, rows: 1, symbol: "more info" }}
            >
              Grading guidelines:{" "}
              <Typography.Text type={"secondary"}>
                This text will be made available to students in their grading
                folder in a file <code>{PEER_GRADING_GUIDE_FN}</code>. Tell your
                students how to grade each problem. Since this is a markdown
                file, you might also provide a link to a publicly shared file or
                directory with guidelines.
              </Typography.Text>
            </Typography.Paragraph>
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
      );
    }

    function render_configure_grid(config): Rendered {
      return (
        <>
          {render_configure_peer_number(config)}
          {render_configure_peer_due(config)}
          {render_configure_grading_guidelines(config)}
        </>
      );
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
        <Typography.Text type="secondary">
          Use peer grading to randomly (and anonymously) redistribute collected
          homework to your students, so that they can grade it for you.
        </Typography.Text>

        {render_configure_peer_checkbox(config)}
        {config.enabled ? render_configure_grid(config) : undefined}
        <div style={{ marginTop: "10px" }}>
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
        </div>
      </Card>
    );
  }
);
