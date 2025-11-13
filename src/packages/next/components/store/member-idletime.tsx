/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  LicenseIdleTimeouts,
  requiresMemberhosting,
} from "@cocalc/util/consts/site-license";
import { Divider, Form, Radio, Typography } from "antd";
import A from "components/misc/A";
import type { JSX } from "react";
const { Text } = Typography;

interface Props {
  form: any;
  showExplanations: boolean;
  disabled?: boolean;
  onChange: () => void;
  boost?: boolean;
  setPresetAdjusted?: (adjusted: boolean) => void;
}

export function IdleTimeout(props: Props) {
  const {
    form,
    showExplanations,
    onChange,
    setPresetAdjusted,
    boost = false,
    disabled = false,
  } = props;

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
      const disabled =
        requiresMemberhosting(key) && !form.getFieldValue("member");
      ret.push(
        <Radio.Button key={key} value={key} disabled={disabled}>
          {it.label}
        </Radio.Button>,
      );
    }
    ret.push(
      <Radio.Button
        key={"always_running"}
        value={"always_running"}
        disabled={!form.getFieldValue("member")}
      >
        Always running
      </Radio.Button>,
    );
    return ret;
  }

  function setUptime(uptime: string) {
    form.setFieldsValue({ uptime });
    setPresetAdjusted?.(true);
    onChange();
  }

  return (
    <>
      <Divider plain>Idle timeout</Divider>
      <Form.Item
        initialValue="short"
        name="uptime"
        label="Idle timeout"
        extra={idleTimeoutExplanation()}
      >
        <Radio.Group
          disabled={disabled}
          onChange={(e) => setUptime(e.target.value)}
        >
          {uptimeOptions()}
        </Radio.Group>
      </Form.Item>
    </>
  );
}
