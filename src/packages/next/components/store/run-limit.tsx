/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Divider, Form } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";

export function RunLimit({
  showExplanations,
  form,
  onChange,
  disabled = false,
  boost = false,
}) {
  function extra() {
    if (!showExplanations) return;

    return (
      <div style={{ marginTop: "5px" }}>
        {boost ? (
          <div style={{ fontWeight: "bold" }}>
            It's not necessary to match the run limit of the license you want to
            boost!
          </div>
        ) : undefined}
        Simultaneously run this many projects using this license. You, and
        anyone you share the license code with, can apply the license to an
        unlimited number of projects, but it will only be used up to the run
        limit. When{" "}
        <A href="https://doc.cocalc.com/teaching-instructors.html">
          teaching a course
        </A>
        ,{" "}
        <b>
          <i>the run limit is typically 2 more than the number of students</i>
        </b>
        .
      </div>
    );
  }

  return (
    <>
      <Divider plain>
        Maximum number of simultaneously upgraded projects
      </Divider>
      <Form.Item
        label="Run Limit"
        name="run_limit"
        initialValue={1}
        extra={extra()}
      >
        <EditRunLimit
          disabled={disabled}
          onChange={(run_limit) => {
            form.setFieldsValue({ run_limit });
            onChange();
          }}
        />
      </Form.Item>
    </>
  );
}

export function EditRunLimit({
  value,
  onChange,
  disabled,
}: {
  value?;
  onChange?;
  disabled?;
}) {
  return (
    <IntegerSlider
      value={value}
      min={1}
      disabled={disabled}
      max={300}
      maxText={10000}
      onChange={onChange}
      units={"projects"}
      presets={[1, 2, 10, 50, 100, 250, 500]}
    />
  );
}
