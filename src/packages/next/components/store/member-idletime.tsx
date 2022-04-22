/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  LicenseIdleTimeouts,
  requiresMemberhosting,
} from "@cocalc/util/consts/site-license";
import { Checkbox, Divider, Form, Radio, Typography } from "antd";
import A from "components/misc/A";

const { Text } = Typography;

export function MemberHostingAndIdleTimeout({
  shadowMember,
  setShadowMember,
  form,
  showExplanations,
  onChange,
  boost = false,
  disabled = false,
}) {
  function memberExplanation(): JSX.Element | undefined {
    if (!showExplanations) return;
    if (boost) {
      return (
        <>
          The state of Member Hosting must match the corresponding Site License
          you want to boost.
        </>
      );
    } else {
      return (
        <>
          Member hosting significanlty reduces competition for resources, and we
          prioritize{" "}
          <A href="support/new" external>
            support requests
          </A>{" "}
          much higher. All licensed projects, with or without member hosting,
          have network access, so they can connect to the network to clone Git
          repositories, download data files and install software.
          {requiresMemberhosting(form.getFieldValue("uptime")) && (
            <>
              <br />
              <Text italic type="secondary">
                Note: this level of idle timeout requires member hosting.
              </Text>
            </>
          )}
          <br />
          <Text italic type="secondary">
            Please be aware: licenses of different member hosting service levels
            cannot be combined!
          </Text>
        </>
      );
    }
  }

  function idleTimeoutExplanation(): JSX.Element | undefined {
    if (!showExplanations) return;

    if (boost) {
      return (
        <>
          The Idle timeout of this Boost license must match the corresponding
          Site License you want to boost.
        </>
      );
    }

    const uptime = form.getFieldValue("uptime");
    const bottom = (
      <>
        <br />
        <Text italic type="secondary">
          Please be aware: licenses with different idle timeouts cannot be
          combined!
        </Text>
      </>
    );
    const main = (function () {
      if (uptime === "always_running") {
        return (
          <>
            <Text strong type="secondary">
              Keep projects running:
            </Text>{" "}
            Once started your project stays running, so you can run very long
            computations and also never have to wait for your project to start.
            This effectively disables{" "}
            <A href="https://doc.cocalc.com/howto/software-development.html#idle-timeout">
              idle timeout
            </A>
            , since your project will restart automatically if it stops. See{" "}
            <A href="https://doc.cocalc.com/project-init.html">
              project init scripts
            </A>
            . (Note: this is NOT guaranteed 100% uptime, since projects may
            sometimes restart for security and maintenance reasons.)
          </>
        );
      } else {
        return (
          <>
            Projects stop automatically if they are not actively used.
            Increasing{" "}
            <A href="https://doc.cocalc.com/howto/software-development.html#idle-timeout">
              idle timeout
            </A>{" "}
            will allow you to run longer calculations without you having to be
            active while they run. However, this is not 100% guaranteed, because
            projects may still restart due to maintenance or security reasons.
          </>
        );
      }
    })();
    return (
      <>
        {main}
        {bottom}
      </>
    );
  }

  function uptimeOptions(): JSX.Element[] {
    const ret: JSX.Element[] = [];
    for (const [key, it] of Object.entries(LicenseIdleTimeouts)) {
      ret.push(
        <Radio.Button key={key} value={key}>
          {it.label}
        </Radio.Button>
      );
    }
    ret.push(
      <Radio.Button key={"always_running"} value={"always_running"}>
        Always running
      </Radio.Button>
    );
    return ret;
  }

  return (
    <>
      <Divider plain>
        {boost ? "Matching" : ""} Hosting quality and Idle timeout
      </Divider>
      <Form.Item
        initialValue={true}
        label="Member hosting"
        name="member"
        valuePropName="checked"
        dependencies={["uptime"]}
        rules={[
          ({ getFieldValue, setFieldsValue }) => ({
            validator: (_, value) => {
              // we force member true if the uptime is higher than medium
              const uptime = getFieldValue("uptime");
              if (requiresMemberhosting(uptime)) {
                if (value !== true) {
                  setShadowMember(value);
                  setFieldsValue({ member: true });
                }
              } else {
                // if the user toggles back to a lower idle timeout,
                // we use shadowMember to restore the previous member value.
                if (shadowMember != null) {
                  setFieldsValue({ member: shadowMember });
                  setShadowMember(null);
                }
              }
            },
          }),
        ]}
        extra={memberExplanation()}
      >
        <Checkbox
          disabled={
            disabled || requiresMemberhosting(form.getFieldValue("uptime"))
          }
        >
          Run project on a much better host with network access
        </Checkbox>
      </Form.Item>
      <Form.Item
        initialValue="short"
        name="uptime"
        label="Idle timeout"
        extra={idleTimeoutExplanation()}
      >
        <Radio.Group
          disabled={disabled}
          onChange={(e) => {
            form.setFieldsValue({ uptime: e.target.value });
            onChange();
          }}
        >
          {uptimeOptions()}
        </Radio.Group>
      </Form.Item>
    </>
  );
}
