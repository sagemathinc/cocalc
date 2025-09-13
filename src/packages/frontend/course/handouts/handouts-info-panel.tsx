/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// CoCalc libraries
// React Libraries
import { Button, Col, Row, Space } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CourseActions } from "../actions";
import { BigTime } from "../common";
import { LastCopyInfo } from "../store";

interface StudentHandoutInfoProps {
  actions: CourseActions;
  info: { handout_id: string; student_id: string; status?: LastCopyInfo };
  title: string;
}

export function StudentHandoutInfo({
  actions,
  info,
  title,
}: StudentHandoutInfoProps) {
  const intl = useIntl();

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
        <Button key="copy_cancel" onClick={() => setRecopy(false)}>
          {intl.formatMessage(labels.cancel)}
        </Button>,
      );
      v.push(
        <Button
          key="copy_confirm"
          danger
          onClick={() => {
            setRecopy(false);
            return copy();
          }}
        >
          <Icon name="share-square" /> Yes, {name.toLowerCase()} again
        </Button>,
      );
      return <Space wrap>{v}</Space>;
    } else {
      return (
        <Button type="dashed" key="copy" onClick={() => setRecopy(true)}>
          <Tip title={name} tip={<span>{copy_tip}</span>}>
            <Icon name="share-square" /> {name}...
          </Tip>
        </Button>
      );
    }
  }

  function render_open_recopy(name, open, copy, copy_tip, open_tip) {
    return (
      <Space key="open_recopy">
        {render_open_recopy_confirm(name, copy, copy_tip)}
        <Button key="open" onClick={open}>
          <Tip title="Open Folder" tip={open_tip}>
            <Icon name="folder-open" /> Open directory...
          </Tip>
        </Button>
      </Space>
    );
  }

  function render_open_copying(open, stop) {
    return (
      <Space key="open_copying">
        <Button key="copy" type="primary" disabled={true}>
          <Icon name="cocalc-ring" spin /> Working...
        </Button>
        <Button key="stop" danger onClick={stop}>
          <Icon name="times" />
        </Button>
        <Button key="open" onClick={open}>
          <Icon name="folder-open" /> Open
        </Button>
      </Space>
    );
  }

  function render_copy(name, copy, copy_tip) {
    return (
      <Tip key="copy" title={name} tip={copy_tip}>
        <Button onClick={copy} type="primary">
          <Icon name="share-square" /> {name}
        </Button>
      </Tip>
    );
  }

  function render_error(name, error) {
    if (typeof error !== "string") {
      error = `${error}`;
    }
    if (error.includes("[object Object]")) {
      // already too late to know the actual error -- it got mangled/reported incorrectly
      error = "";
    }
    if (error.indexOf("No such file or directory") !== -1) {
      error = `Somebody may have moved the folder that should have contained the handout -- \n${error}`;
    } else {
      error = `Try to ${name.toLowerCase()} again -- \n${error}`;
    }
    return (
      <ShowError
        key="error"
        error={error}
        style={{ marginTop: "5px", maxHeight: "140px", overflow: "auto" }}
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
      if (webapp_client.server_time() - (obj.start ?? 0) < 15_000) {
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
                "Open the student's copy of this handout directly in their project.  You will be able to see them type, chat with them, answer questions, etc.",
              )}
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
}
