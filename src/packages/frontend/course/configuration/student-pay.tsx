import { Alert, Button, Card, Checkbox } from "antd";
import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  DateTimePicker,
  Gap,
  Icon,
  TimeAgo,
} from "@cocalc/frontend/components";
import { upgrades } from "@cocalc/util/upgrade-spec";
import { days_ago } from "@cocalc/util/misc";

const STUDENT_COURSE_PRICE = upgrades.subscription.student_course.price.month4;

export default function StudentPay({ actions, settings }) {
  const [show_students_pay, set_show_students_pay] = useState<boolean>(false);

  function get_student_pay_when(): Date | string {
    const date = settings.get("pay");
    if (date) {
      return date;
    } else {
      return days_ago(-7);
    }
  }

  function handle_student_pay_button(): void {
    set_show_students_pay(true);
  }

  function render_students_pay_button() {
    return (
      <div style={{ textAlign: "center", margin: "15px 0" }}>
        <Button type="primary" onClick={handle_student_pay_button}>
          <Icon name="arrow-circle-up" /> Configure how students will pay...
        </Button>
      </div>
    );
  }

  function render_student_pay_choice_checkbox() {
    return (
      <span>
        <Checkbox
          checked={
            !!(settings != null ? settings.get("student_pay") : undefined)
          }
          onChange={handle_student_pay_choice}
        >
          Students will pay for this course
        </Checkbox>
      </span>
    );
  }

  function handle_student_pay_choice(e): void {
    actions.configuration.set_pay_choice("student", e.target.checked);
    if (e.target.checked) {
      set_show_students_pay(true);
      actions.configuration.set_course_info(get_student_pay_when());
    }
  }

  function render_require_students_pay_desc() {
    const date = new Date(settings.get("pay"));
    if (date > webapp_client.server_time()) {
      return (
        <span>
          <b>
            Your students will see a warning until <TimeAgo date={date} />.
          </b>{" "}
          They will then be required to upgrade for a special discounted
          one-time fee of ${STUDENT_COURSE_PRICE}.
        </span>
      );
    } else {
      return (
        <span>
          <b>
            Your students are required to upgrade their project now to use it.
          </b>{" "}
          If you want to give them more time to upgrade, move the date forward.
        </span>
      );
    }
  }

  function render_require_students_pay_when() {
    if (!settings.get("pay")) {
      return <span />;
    }

    return (
      <div style={{ margin:"15px 0"}}>
        <div style={{ width: "50%", marginLeft: "3em", marginBottom: "10px" }}>
          <DateTimePicker
            style={{ width: "20em" }}
            placeholder={"Student Pay Deadline"}
            value={
              typeof settings.get("pay") === "string"
                ? new Date(settings.get("pay"))
                : settings.get("pay")
            }
            onChange={(date) => {
              actions.configuration.set_course_info(
                date != null ? date.toISOString() : undefined
              );
            }}
          />
        </div>
        {settings.get("pay") ? render_require_students_pay_desc() : undefined}
      </div>
    );
  }

  function render_students_pay_submit_buttons() {
    return <Button onClick={() => set_show_students_pay(false)}>Close</Button>;
  }

  function handle_students_pay_checkbox(e): void {
    if (e.target.checked) {
      actions.configuration.set_course_info(get_student_pay_when());
    } else {
      actions.configuration.set_course_info("");
    }
  }

  function render_students_pay_checkbox_label() {
    if (settings.get("pay")) {
      if (webapp_client.server_time() >= settings.get("pay")) {
        return <span>Require that students upgrade immediately:</span>;
      } else {
        return (
          <span>
            Require that students upgrade by{" "}
            <TimeAgo date={settings.get("pay")} />:{" "}
          </span>
        );
      }
    } else {
      return <span>Require that students upgrade...</span>;
    }
  }

  function render_students_pay_checkbox() {
    return (
      <span>
        <Checkbox
          checked={!!settings.get("pay")}
          onChange={handle_students_pay_checkbox}
        >
          {render_students_pay_checkbox_label()}
        </Checkbox>
      </span>
    );
  }

  function render_students_pay_dialog() {
    return (
      <Alert
        style={{ margin: "15px 0" }}
        message={
          <div>
            <h3>
              <Icon name="arrow-circle-up" /> Require Students to Upgrade
            </h3>
            <hr />
            <span>
              Click the following checkbox to require that all students in the
              course pay a special discounted{" "}
              <b>one-time ${STUDENT_COURSE_PRICE}</b> fee to move their project
              from trial servers to better members-only servers, enable full
              internet access, and not see a large red warning message. This
              lasts four months, and{" "}
              <em>you will not be charged (only students are charged).</em>
            </span>

            {render_students_pay_checkbox()}
            {settings.get("pay")
              ? render_require_students_pay_when()
              : undefined}
            {render_students_pay_submit_buttons()}
          </div>
        }
      />
    );
  }

  function render_student_pay_desc() {
    if (settings.get("pay")) {
      return (
        <span>
          <span style={{ fontSize: "18pt" }}>
            <Icon name="check" />
          </span>{" "}
          <Gap />
          {render_require_students_pay_desc()}
        </span>
      );
    } else {
      return (
        <span>
          Require that all students in the course pay a one-time $
          {STUDENT_COURSE_PRICE} fee to move their projects off trial servers
          and enable full internet access, for four months. This is strongly
          recommended, and ensures that your students have a better experience,
          and do not see a large{" "}
          <span style={{ color: "red" }}>RED warning banner</span> all the time.
          Alternatively, you (or your university) can pay for all students at
          one for a significant discount -- see below.
        </span>
      );
    }
  }

  function render_student_pay_details() {
    return (
      <div>
        {show_students_pay
          ? render_students_pay_dialog()
          : render_students_pay_button()}
        <hr />
        <div style={{ color: "#666" }}>{render_student_pay_desc()}</div>
      </div>
    );
  }

  let bg, style;
  if (
    (settings != null ? settings.get("student_pay") : undefined) ||
    (settings != null ? settings.get("institute_pay") : undefined)
  ) {
    style = bg = undefined;
  } else {
    style = { fontWeight: "bold" };
    bg = "#fcf8e3";
  }
  return (
    <>
      <Card
        style={{ background: bg }}
        title={
          <div style={style}>
            <Icon name="dashboard" /> Require students to upgrade (students pay)
          </div>
        }
      >
        {render_student_pay_choice_checkbox()}
        {settings?.get("student_pay") && render_student_pay_details()}
      </Card>
      <br />
    </>
  );
}
