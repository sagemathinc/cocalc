/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider, Form } from "antd";

import { unreachable } from "@cocalc/util/misc";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";

import type { LicenseSource } from "@cocalc/util/upgrades/shopping";

export const MAX_ALLOWED_RUN_LIMIT = 10000;

interface RunLimitProps {
  showExplanations: boolean;
  form: any;
  onChange: () => void;
  disabled?: boolean;
  boost?: boolean;
  source: LicenseSource;
}

export function RunLimit({
  showExplanations,
  form,
  onChange,
  disabled = false,
  boost = false,
  source,
}: RunLimitProps) {
  function extra() {
    if (!showExplanations) return;

    switch (source) {
      case "license":
        return (
          <div style={{ marginTop: "5px" }}>
            {boost ? (
              <div style={{ fontWeight: "bold" }}>
                It's not necessary to match the run limit of the license you
                want to boost!
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
              <i>
                the run limit is typically 2 more than the number of students
                (one for each student, one for the shared project and one for
                the instructor project)
              </i>
            </b>
            .
          </div>
        );
      case "course":
        return (
          <div style={{ marginTop: "5px" }}>
            It's advised to select two more seatch than the number of students
            (one for each student, one for the shared project and one for the
            instructor project)
          </div>
        );

      default:
        unreachable(source);
    }
  }

  switch (source) {
    case "license":
      return (
        <>
          <Divider plain>Simultaneous Project Upgrades</Divider>
          <Form.Item
            label="Run Limit"
            name="run_limit"
            initialValue={1}
            extra={extra()}
          >
            <EditRunLimit
              type={source}
              disabled={disabled}
              onChange={(run_limit) => {
                form.setFieldsValue({ run_limit });
                onChange();
              }}
            />
          </Form.Item>
        </>
      );

    case "course":
      return (
        <>
          <Divider plain>Size of Course</Divider>
          <Form.Item
            label="Students"
            name="run_limit"
            initialValue={25}
            extra={extra()}
          >
            <EditRunLimit
              type={source}
              disabled={disabled}
              onChange={(run_limit) => {
                form.setFieldsValue({ run_limit });
                onChange();
              }}
            />
          </Form.Item>
        </>
      );

    default:
      unreachable(source);
  }
}

function EditRunLimit({
  value,
  onChange,
  disabled,
  type,
}: {
  value?: number;
  onChange: (run_limit: number) => void;
  disabled?: boolean;
  type: LicenseSource;
}) {
  return (
    <IntegerSlider
      value={value}
      min={1}
      disabled={disabled}
      max={300}
      maxText={MAX_ALLOWED_RUN_LIMIT}
      onChange={onChange}
      units={type === "course" ? "students" : "projects"}
      presets={
        type === "course"
          ? [10, 25, 50, 75, 100, 125, 150, 200]
          : [1, 2, 10, 50, 100, 250, 500]
      }
    />
  );
}
