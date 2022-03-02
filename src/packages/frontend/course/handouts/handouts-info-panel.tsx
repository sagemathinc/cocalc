/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// CoCalc libraries
// React Libraries
import { React, useState } from "@cocalc/frontend/app-framework";
import { to_json } from "@cocalc/util/misc";
import { Col, Row } from "antd";
import { Button, ButtonGroup } from "../../antd-bootstrap";
import { ErrorDisplay, Icon, Tip } from "../../components";
import { CourseActions } from "../actions";
import { BigTime } from "../common";
import { LastCopyInfo } from "../store";

interface StudentHandoutInfoProps {
  actions: CourseActions;
  info: { handout_id: string; student_id: string; status?: LastCopyInfo };
  title: string;
}

export const StudentHandoutInfo: React.FC<StudentHandoutInfoProps> = (
  props: StudentHandoutInfoProps
) => {
  const { actions, info, title } = props;

  const [recopy, setRecopy] = useState<boolean>(false);

  function open(handout_id: string, student_id: string): void {
    actions.handouts.open_handout(handout_id, student_id);
  }

  function copy(handout_id: string, student_id: string): void {
    actions.handouts.copy_handout_to_student(handout_id, student_id, false);
  }

  function stop(handout_id: string, student_id: string): void {
    actions.handouts.stop_copying_handout(handout_id, student_id);
  }

  function render_last_time(time) {
    return (
      <div key="time" style={{ color: "#666" }}>
        (<BigTime date={time} />)
      </div>
    );
  }

  function render_open_recopy_confirm(name, copy, copy_tip) {
    if (recopy) {
      const v: any[] = [];
      v.push(
        <Button
          key="copy_confirm"
          bsStyle="danger"
          onClick={() => {
            setRecopy(false);
            return copy();
          }}
        >
          <Icon name="share-square" /> Yes, {name.toLowerCase()} again
        </Button>
      );
      v.push(
        <Button key="copy_cancel" onClick={() => setRecopy(false)}>
          Cancel
        </Button>
      );
      return v;
    } else {
      return (
        <Button key="copy" bsStyle="warning" onClick={() => setRecopy(true)}>
          <Tip title={name} tip={<span>{copy_tip}</span>}>
            <Icon name="share-square" /> {name}...
          </Tip>
        </Button>
      );
    }
  }

  function render_open_recopy(name, open, copy, copy_tip, open_tip) {
    return (
      <ButtonGroup key="open_recopy">
        {render_open_recopy_confirm(name, copy, copy_tip)}
        <Button key="open" onClick={open}>
          <Tip title="Open Directory" tip={open_tip}>
            <Icon name="folder-open" /> Open directory...
          </Tip>
        </Button>
      </ButtonGroup>
    );
  }

  function render_open_copying(open, stop) {
    return (
      <ButtonGroup key="open_copying">
        <Button key="copy" bsStyle="success" disabled={true}>
          <Icon name="cocalc-ring" spin /> Working...
        </Button>
        <Button key="stop" bsStyle="danger" onClick={stop}>
          <Icon name="times" />
        </Button>
        <Button key="open" onClick={open}>
          <Icon name="folder-open" /> Open
        </Button>
      </ButtonGroup>
    );
  }

  function render_copy(name, copy, copy_tip) {
    return (
      <Tip key="copy" title={name} tip={copy_tip}>
        <Button onClick={copy} bsStyle={"primary"}>
          <Icon name="share-square" /> {name}
        </Button>
      </Tip>
    );
  }

  function render_error(name, error) {
    if (typeof error !== "string") {
      error = to_json(error);
    }
    if (error.indexOf("No such file or directory") !== -1) {
      error = `Somebody may have moved the folder that should have contained the handout.\n${error}`;
    } else {
      error = `Try to ${name.toLowerCase()} again:\n` + error;
    }
    return (
      <ErrorDisplay
        key="error"
        error={error}
        style={{ maxHeight: "140px", overflow: "auto" }}
      />
    );
  }

  function render_last(name, obj, info, enable_copy, copy_tip, open_tip) {
    const do_open = () => open(info.handout_id, info.student_id);
    const do_copy = () => copy(info.handout_id, info.student_id);
    const do_stop = () => stop(info.handout_id, info.student_id);
    if (obj == null) {
      obj = {};
    }
    const v: any[] = [];
    if (enable_copy) {
      if (obj.start) {
        v.push(render_open_copying(do_open, do_stop));
      } else if (obj.time) {
        v.push(render_open_recopy(name, do_open, do_copy, copy_tip, open_tip));
      } else {
        v.push(render_copy(name, do_copy, copy_tip));
      }
    }
    if (obj.time) {
      v.push(render_last_time(obj.time));
    }
    if (obj.error) {
      v.push(render_error(name, obj.error));
    }
    return v;
  }

  return (
    <div>
      <Row
        style={{
          borderTop: "1px solid #aaa",
          paddingTop: "5px",
          paddingBottom: "5px",
        }}
      >
        <Col md={4} key="title">
          {title}
        </Col>
        <Col md={20} key="rest">
          <Row>
            <Col md={24} key="last_handout">
              {render_last(
                "Distribute",
                info.status,
                info,
                true,
                "Copy the handout from your project to this student's project.",
                "Open the student's copy of this handout directly in their project.  You will be able to see them type, chat with them, answer questions, etc."
              )}
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};
