/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider, Form } from "antd";
import { useRouter } from "next/router";

import { unreachable } from "@cocalc/util/misc";
import {
  WORKSPACE_LABEL,
  WORKSPACES_LABEL,
} from "@cocalc/util/i18n/terminology";
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
  const router = useRouter();

  function extra() {
    if (!showExplanations) return;

    switch (source) {
      case "site-license":
        return (
          <div style={{ marginTop: "5px" }}>
            {boost ? (
              <div style={{ fontWeight: "bold" }}>
                It's not necessary to match the run limit of the license you
                want to boost!
              </div>
            ) : undefined}
            Simultaneously run this many {WORKSPACES_LABEL.toLowerCase()} using
            this license. You, and
            anyone you share the license code with can apply the license to an
            unlimited number of {WORKSPACE_LABEL.toLowerCase()}s, but it will
            only be used up to the run
            limit. When{" "}
            <A href="https://doc.cocalc.com/teaching-instructors.html">
              teaching a course
            </A>
            ,{" "}
            <b>
              <i>
                the run limit is typically 2 more than the number of students
                (one for each student, one for the shared{" "}
                {WORKSPACE_LABEL.toLowerCase()} and one for the instructor{" "}
                {WORKSPACE_LABEL.toLowerCase()})
              </i>
            </b>
            .
          </div>
        );
      case "course":
        return (
          <div style={{ marginTop: "5px" }}>
            If you consider creating a shared{" "}
            {WORKSPACE_LABEL.toLowerCase()} for your course, you should select
            one more seat than the number of students. One for each student,
            and one for the shared {WORKSPACE_LABEL.toLowerCase()}. Regarding
            your instructor {WORKSPACE_LABEL.toLowerCase()}, you need one
            additional seat or purchase a regular{" "}
            <a onClick={() => router.push("/store/site-license")}>
              site license
            </a>{" "}
            to cover it.
          </div>
        );

      default:
        unreachable(source);
    }
  }

  switch (source) {
    case "site-license":
      return (
        <>
          <Divider plain>Simultaneous Workspace Upgrades</Divider>
          <Form.Item
            label="Run Limit"
            name="run_limit"
            initialValue={1}
            extra={extra()}
          >
            <EditRunLimit
              source={source}
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
              source={source}
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
  source,
}: {
  value?: number;
  onChange: (run_limit: number) => void;
  disabled?: boolean;
  source: LicenseSource;
}) {
  return (
    <IntegerSlider
      value={value}
      min={1}
      disabled={disabled}
      max={300}
      maxText={MAX_ALLOWED_RUN_LIMIT}
      onChange={onChange}
      units={
        source === "course" ? "students" : WORKSPACES_LABEL.toLowerCase()
      }
      presets={
        source === "course"
          ? [10, 25, 50, 75, 100, 125, 150, 200]
          : [1, 2, 10, 50, 100, 250, 500]
      }
    />
  );
}
