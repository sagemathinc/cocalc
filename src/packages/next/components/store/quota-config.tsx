/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { LicenseIdleTimeouts } from "@cocalc/util/consts/site-license";
import { plural } from "@cocalc/util/misc";
import { Col, Divider, Form, Radio, Row, Space, Tabs } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import { Preset, PRESETS, Presets } from "./quota-config-presets";

const { TabPane } = Tabs;

interface Props {
  showExplanations: boolean;
  form: any;
  disabled?: boolean;
  onChange: () => void;
  boost?: boolean;
  // boost doesn't define any of the below, that's only for site-license
  configMode?: "preset" | "expert";
  setConfigMode?: (mode: "preset" | "expert") => void;
  preset?: Presets;
  setPreset?: (preset: Presets) => void;
}

export const QuotaConfig: React.FC<Props> = (props: Props) => {
  const {
    showExplanations,
    form,
    disabled = false,
    onChange,
    boost = false,
    configMode,
    setConfigMode,
    preset,
    setPreset,
  } = props;

  function title() {
    if (boost) {
      return "Booster";
    } else {
      return "Quota upgrades";
    }
  }

  const min = boost ? 0 : 1;

  // e.g. since we can't go beyond the max cpu, but the base license already provides one, don't let users select the max
  const adjMax = boost ? 1 : 0;

  function ram() {
    const defaultRam = 2; // 2gb highly recommended
    const maxRam = 16 - adjMax;

    return (
      <Form.Item
        label="Shared RAM"
        name="ram"
        initialValue={boost ? 0 : defaultRam}
        extra={
          showExplanations ? (
            <>
              Each project can use up to this much of RAM. Note that RAM may be
              limited, if many other users are using the same host – though
              member hosting significantly reduces competition for RAM. We
              recommend at least 2G! Beyond that, we also offer{" "}
              <A href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </A>{" "}
              with larger memory options.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={min}
          max={maxRam}
          onChange={(ram) => {
            form.setFieldsValue({ ram });
            onChange();
          }}
          units={"G RAM"}
          presets={boost ? [0, 2, 4, 8, 10] : [1, 2, 4, 8, 16]}
        />
      </Form.Item>
    );
  }

  function cpu() {
    return (
      <Form.Item
        label="Shared CPUs"
        name="cpu"
        initialValue={min}
        extra={
          showExplanations ? (
            <>
              <A href="https://cloud.google.com/compute/docs/faq#virtualcpu">
                Google cloud vCPU's.
              </A>{" "}
              To keep prices low, these vCPU's may be shared with other
              projects, though member hosting very significantly reduces
              competition for CPUs. We also offer{" "}
              <A href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </A>{" "}
              with more CPU options.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={min}
          max={3 - adjMax}
          onChange={(cpu) => {
            form.setFieldsValue({ cpu });
            onChange();
          }}
          units={"vCPU"}
          presets={boost ? [0, 1, 2] : [1, 2, 3]}
        />
      </Form.Item>
    );
  }

  function disk() {
    // 2022-06: price increase "version 2": minimum disk we sell (also the free quota) is 3gb, not 1gb
    const defaultDisk = 3;
    const minDisk = boost ? 0 : defaultDisk;
    const maxDisk = 15 - adjMax * defaultDisk;

    return (
      <Form.Item
        label="Disk space"
        name="disk"
        initialValue={minDisk}
        extra={
          showExplanations ? (
            <>
              Extra disk space lets you store a larger number of files.
              Snapshots and file edit history is included at no additional
              charge. Each project receives at least {defaultDisk}G of storage
              space. We also offer much larger{" "}
              <A href={"/store/dedicated?type=disk"}>dedicated disks</A>.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={minDisk}
          max={maxDisk}
          onChange={(disk) => {
            form.setFieldsValue({ disk });
            onChange();
          }}
          units={"G Disk"}
          presets={boost ? [0, 3, 6, maxDisk] : [3, 5, 10, maxDisk]}
        />
      </Form.Item>
    );
  }

  function presetExtra() {
    const cpuValue = form.getFieldValue("cpu");
    const ramValue = form.getFieldValue("ram");
    const diskValue = form.getFieldValue("disk");
    const memberValue = form.getFieldValue("member");
    const uptimeValue = form.getFieldValue("uptime");

    if (
      preset == null ||
      cpuValue == null ||
      ramValue == null ||
      diskValue == null ||
      memberValue == null ||
      uptimeValue == null
    )
      return;

    const presetData: Preset = PRESETS[preset];
    if (presetData == null) {
      return (
        <div>
          Error: preset <code>{preset}</code> is not known.
        </div>
      );
    }
    const { name, descr, details } = presetData;

    function presetDescription() {
      if (!descr) {
        return "";
      } else {
        return <>{descr}. It</>;
      }
    }

    function renderDetails() {
      if (details) {
        return details;
      }
    }

    function renderProvides() {
      const basic = (
        <>
          provides up to {cpuValue} CPU {plural(cpuValue, "core")}, {ramValue}G{" "}
          memory, and {diskValue}G disk space for each project.
        </>
      );
      const mh = memberValue === false ? <>member hosting is disabled</> : null;
      const ut =
        uptimeValue !== "short" ? (
          <>
            {mh != null ? "and" : ""} the project's idle timeout is set to{" "}
            {LicenseIdleTimeouts[uptimeValue].label}
          </>
        ) : null;

      const any = mh != null || ut != null;

      return (
        <>
          {basic} {any ? "Additionally, " : ""}
          {mh}
          {ut}
          {any ? "." : ""}
        </>
      );
    }

    return (
      <Space direction="vertical">
        <div></div>
        <div>
          Preset <strong>"{name}"</strong> {presetDescription()}{" "}
          {renderProvides()} {renderDetails()}
        </div>
      </Space>
    );
  }

  function onPresetChange(newVal) {
    const val = newVal.target.value;
    if (val == null || setPreset == null) return;
    setPreset(val);
    const preset = PRESETS[val];
    if (preset != null) {
      const { cpu, ram, disk, uptime = "short", member = true } = preset;
      form.setFieldsValue({ uptime, member, cpu, ram, disk });
    }
    onChange();
  }

  function presets() {
    return (
      <>
        <Form.Item label="Presets" shouldUpdate={true} extra={presetExtra()}>
          <Radio.Group onChange={onPresetChange} value={preset}>
            <Space size={[10, 10]} wrap>
              {Object.keys(PRESETS).map((p) => {
                const presetData = PRESETS[p];
                return (
                  <Radio.Button key={p} value={p}>
                    <Icon name={presetData.icon ?? "arrow-up"} />{" "}
                    {presetData.name}
                  </Radio.Button>
                );
              })}
            </Space>
          </Radio.Group>
        </Form.Item>
      </>
    );
  }

  function detailed() {
    return (
      <>
        {ram()}
        {cpu()}
        {disk()}
      </>
    );
  }

  function main() {
    if (boost) {
      return (
        <>
          <div>TODO EXPLANATION</div>
          {detailed()}
        </>
      );
    } else {
      return (
        <Tabs
          activeKey={configMode}
          onChange={setConfigMode}
          type="card"
          tabPosition="top"
          renderTabBar={(props, DefaultTabBar) => (
            <Row>
              <Col span={18} offset={6} className="ant-tabs-card">
                <DefaultTabBar {...props} />
              </Col>
            </Row>
          )}
        >
          <TabPane
            tab={
              <span>
                <Icon name="lightbulb" />
                Quota presets
              </span>
            }
            key="preset"
          >
            {presets()}
          </TabPane>
          <TabPane
            tab={
              <span>
                <Icon name="wrench" />
                Expert configuration
              </span>
            }
            key="expert"
          >
            {detailed()}
          </TabPane>
        </Tabs>
      );
    }
  }

  return (
    <>
      <Divider plain>{title()}</Divider>
      {main()}
    </>
  );
};
