/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { displaySiteLicense } from "@cocalc/util/consts/site-license";
import { plural } from "@cocalc/util/misc";
import {
  BOOST,
  DISK_DEFAULT_GB,
  MAX_RAM_GB,
  REGULAR,
} from "@cocalc/util/upgrades/consts";
import { Col, Divider, Form, Radio, Row, Space, Tabs, Typography } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import { Preset, PRESETS, Presets } from "./quota-config-presets";

const { Text } = Typography;
const { TabPane } = Tabs;

const EXPERT_CONFIG = "Expert configuration";

interface Props {
  showExplanations: boolean;
  form: any;
  disabled?: boolean;
  onChange: () => void;
  boost?: boolean;
  // boost doesn't define any of the below, that's only for site-license
  configMode?: "preset" | "expert";
  setConfigMode?: (mode: "preset" | "expert") => void;
  preset?: Presets | null;
  setPreset?: (preset: Presets | null) => void;
  presetAdjusted?: boolean;
  setPresetAdjusted?: (adjusted: boolean) => void;
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
    presetAdjusted,
    setPresetAdjusted,
  } = props;

  function title() {
    if (boost) {
      return "Booster";
    } else {
      return "Quota upgrades";
    }
  }

  const PARAMS = boost ? BOOST : REGULAR;

  function explainRam() {
    if (!showExplanations) return;
    return (
      <>
        This quota limits the total amount of memory a project can use. Note
        that RAM may be limited, if many other users are using the same host –
        though member hosting significantly reduces competition for RAM. We
        recommend at least 2G! Beyond the overall maximum of {MAX_RAM_GB}G, we
        also offer{" "}
        <A href={"/store/dedicated?type=vm"}>dedicated virtual machines</A> with
        larger memory options.
      </>
    );
  }

  /**
   * When a quota is changed, we warn the user that the preset was adjusted. (the text updates, though, since it rerenders every time). Explanation in the details could make no sense, though – that's why this is added.
   */
  function presetWasAdjusted() {
    setPresetAdjusted?.(true);
  }

  function ram() {
    return (
      <Form.Item
        label="Shared RAM"
        name="ram"
        initialValue={PARAMS.ram.dflt}
        extra={explainRam()}
      >
        <IntegerSlider
          disabled={disabled}
          min={PARAMS.ram.min}
          max={PARAMS.ram.max}
          onChange={(ram) => {
            form.setFieldsValue({ ram });
            presetWasAdjusted();
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
        initialValue={PARAMS.cpu.dflt}
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
          min={PARAMS.cpu.min}
          max={PARAMS.cpu.max}
          onChange={(cpu) => {
            form.setFieldsValue({ cpu });
            presetWasAdjusted();
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
    return (
      <Form.Item
        label="Disk space"
        name="disk"
        initialValue={PARAMS.disk.dflt}
        extra={
          showExplanations ? (
            <>
              Extra disk space lets you store a larger number of files.
              Snapshots and file edit history is included at no additional
              charge. Each project receives at least {DISK_DEFAULT_GB}G of
              storage space. We also offer much larger{" "}
              <A href={"/store/dedicated?type=disk"}>dedicated disks</A>.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={PARAMS.disk.min}
          max={PARAMS.disk.max}
          onChange={(disk) => {
            form.setFieldsValue({ disk });
            presetWasAdjusted();
            onChange();
          }}
          units={"G Disk"}
          presets={
            boost ? [0, 3, 6, PARAMS.disk.max] : [3, 5, 10, PARAMS.disk.max]
          }
        />
      </Form.Item>
    );
  }

  function infoText() {
    if (preset == null) {
      return (
        <Text type="danger">
          Currently, no preset selection is active. Select a preset above to
          reset your recent changes.
        </Text>
      );
    }

    const cpuValue = form.getFieldValue("cpu");
    const ramValue = form.getFieldValue("ram");
    const diskValue = form.getFieldValue("disk");
    const memberValue = form.getFieldValue("member");
    const uptimeValue = form.getFieldValue("uptime");

    if (
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
          provides up to{" "}
          <Text strong>
            {cpuValue} CPU {plural(cpuValue, "core")}
          </Text>
          , <Text strong>{ramValue}G memory</Text>, and{" "}
          <Text strong>{diskValue}G disk space</Text> for each project.
        </>
      );

      const mh =
        memberValue === false ? (
          <Text strong>member hosting is disabled</Text>
        ) : null;

      const ut =
        uptimeValue !== "short" ? (
          <>
            {mh != null ? " and" : ""} the project's{" "}
            <Text strong>
              idle timeout is {displaySiteLicense(uptimeValue)}
            </Text>
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

    function presetIsAdjusted() {
      if (!presetAdjusted) return;
      return (
        <Typography style={{ marginBottom: "10px" }}>
          <Text type="warning">
            The preset has been adjusted and parts of the description might no
            longer be applicable. If you select another one, your modifications
            will be reset.
          </Text>
        </Typography>
      );
    }

    return (
      <>
        {presetIsAdjusted()}
        <Typography>
          Preset <Text strong>"{name}"</Text> {presetDescription()}{" "}
          {renderProvides()} {renderDetails()}
        </Typography>
      </>
    );
  }

  function presetsCommon() {
    if (!showExplanations) return null;
    return (
      <Text type="secondary">
        After selecting a preset, feel free to fine tune the selection in the "
        {EXPERT_CONFIG}" or change the "Member hosting" or the "Idle timeout"
        configuration below. Subsequent preset selections will reset your
        adjustments.
      </Text>
    );
  }

  function presetExtra() {
    return (
      <Space direction="vertical">
        <div></div>
        <div>{infoText()}</div>
        {presetsCommon()}
      </Space>
    );
  }

  function onPresetChange(newVal) {
    const val = newVal.target.value;
    if (val == null || setPreset == null) return;
    setPreset(val);
    setPresetAdjusted?.(false);
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
          <Row>
            <Col xs={16} offset={6} style={{ marginBottom: "20px" }}>
              <Text type="secondary">
                Configure the quotas you want to add on top of your existing
                license. E.g. if your license provides a limit of 2G of RAM and
                you add a matching boost license with 3G of RAM, you'll end up
                with a total quota limit of 5G of RAM.
              </Text>
            </Col>
          </Row>
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
          size="middle"
          centered={true}
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
                {EXPERT_CONFIG}
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
