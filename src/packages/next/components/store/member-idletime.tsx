/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import {
  displaySiteLicense,
  LicenseIdleTimeouts,
  requiresMemberhosting,
  Uptime,
} from "@cocalc/util/consts/site-license";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Form,
  Radio,
  Select,
  Typography,
} from "antd";
import A from "components/misc/A";
import useAPI from "lib/hooks/api";
import { useMemo } from "react";

const { Text } = Typography;
const { Option } = Select;

interface MLProps {
  setConfig: ({ member, uptime }) => void;
}

const ManagedLicenses: React.FC<MLProps> = (props: MLProps) => {
  const { setConfig } = props;

  const {
    result,
    error,
    call: refresh,
    calling,
  } = useAPI("licenses/get-managed", undefined, 600);

  const managedLicenses = useMemo(() => {
    if (!Array.isArray(result)) return [];
    const now = Date.now();
    const filtered =
      result?.filter((l) => {
        // hide expired licenses
        if (l.expires != null && l.expires < now) return false;
        if (l.quota?.dedicated_disk != null || l.quota?.dedicated_vm != null) {
          return false;
        }
        return true;
      }) ?? [];

    filtered.sort((a, b) => {
      return (a.activated ?? 0) - (b.activated ?? 0);
    });

    return filtered;
  }, [result]);

  function shortQuotaDescription(
    run_limit: number,
    quota?: SiteLicenseQuota & { uptime?: Uptime }
  ): string {
    if (quota == null) return ""; // I saw this in production.
    const { cpu, ram, disk, always_running, idle_timeout, member } = quota;
    const up =
      always_running === true
        ? "always running"
        : idle_timeout != null
        ? displaySiteLicense(idle_timeout)
        : "idle-timeout unknown";
    const mh = member ? "member hosting" : "no member hosting";
    const res = `${cpu} CPU, ${ram}G RAM, ${disk}G disk`;
    return `${run_limit}x ${res}, ${up}, ${mh}`;
  }

  function renderLicenses() {
    if (managedLicenses == null || managedLicenses.length === 0) {
      return [
        <Option key="first" value="first" disabled="true">
          {calling ? "Loading…" : "No licenses found"}
        </Option>,
      ];
    } else {
      const entries = managedLicenses.map((license) => {
        // split the license id at "-" and take the last part
        const shortID = license.id.split("-").pop();
        const quota = shortQuotaDescription(license.run_limit, license.quota);
        return (
          <Option key={license.id} value={license.id}>
            {license.title ?? "No title"}{" "}
            <Text type="secondary">({shortID})</Text>: {quota}
          </Option>
        );
      });
      entries.unshift(
        <Option disabled="true" key="first" value="first">
          Select a license
        </Option>
      );
      return entries;
    }
  }

  function onSelection(license_id: string) {
    const license = managedLicenses.find((l) => l.id === license_id);
    if (license == null) return;
    const q = license.quota;
    if (q == null) return;
    const uptime =
      q.always_running === true ? "always_running" : q.idle_timeout;
    setConfig({ member: q.member, uptime });
  }

  if (error) {
    return (
      <Alert
        type="error"
        message={
          <>
            <p>
              Unable to retrieve licenses:{" "}
              <Button
                type="link"
                onClick={() => refresh(undefined, undefined, 0)}
              >
                try again
              </Button>
            </p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
          </>
        }
      />
    );
  } else {
    return (
      <Select
        loading={calling}
        defaultValue={"first"}
        suffixIcon={<Icon name="reload" onClick={() => refresh()} />}
        onChange={onSelection}
      >
        {renderLicenses()}
      </Select>
    );
  }
};

interface Props {
  shadowMember: boolean | null;
  setShadowMember: (shadowMember: boolean | null) => void;
  form: any;
  showExplanations: boolean;
  disabled?: boolean;
  onChange: () => void;
  boost?: boolean;
  setPresetAdjusted?: (adjusted: boolean) => void;
}

export function MemberHostingAndIdleTimeout(props: Props) {
  const {
    shadowMember,
    setShadowMember,
    form,
    showExplanations,
    onChange,
    setPresetAdjusted,
    boost = false,
    disabled = false,
  } = props;

  function setConfig({ member, uptime }) {
    setUptime(uptime);
    setMemberHosting(member);
  }

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
          Member hosting significantly reduces competition for resources, and we
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

  function boostAssist() {
    if (!boost) return;
    return (
      <Form.Item label="Select license">
        Boosts can only boost matching "Member hosting" and "Idle timeout"
        licenses. If you are unsure, select one of your licenses:{" "}
        {<ManagedLicenses setConfig={setConfig} />}
      </Form.Item>
    );
  }

  function setUptime(uptime: string) {
    form.setFieldsValue({ uptime });
    setPresetAdjusted?.(true);
    onChange();
  }

  function setMemberHosting(member: boolean) {
    form.setFieldsValue({ member });
    setPresetAdjusted?.(true);
    onChange();
  }

  return (
    <>
      <Divider plain>
        {boost ? "Matching" : ""} Hosting quality and Idle timeout
      </Divider>
      {boostAssist()}
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
          onChange={(e) => setMemberHosting(e.target.checked)}
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
          onChange={(e) => setUptime(e.target.value)}
        >
          {uptimeOptions()}
        </Radio.Group>
      </Form.Item>
    </>
  );
}
