/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Col,
  Divider,
  Form,
  Radio,
  Row,
  Space,
  Tabs,
  Typography,
} from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { displaySiteLicense } from "@cocalc/util/consts/site-license";
import { plural } from "@cocalc/util/misc";
import { BOOST, DISK_DEFAULT_GB, REGULAR } from "@cocalc/util/upgrades/consts";
import { CSS } from "components/misc";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import {
  PRESETS,
  PRESET_MATCH_FIELDS,
  Preset,
  Presets,
} from "./quota-config-presets";

const { Text } = Typography;

const EXPERT_CONFIG = "Expert configuration";
const listFormat = new Intl.ListFormat("en");

const RAM_HIGH_WARN_THRESHOLD = 10;
const RAM_LOW_WARN_THRESHOLD = 1;
const MEM_MIN_RECOMMEND = 2;
const CPU_HIGH_WARN_THRESHOLD = 3;

const WARNING_BOX: CSS = { marginTop: "10px", marginBottom: "10px" };

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

  const ramVal = Form.useWatch("ram", form);
  const cpuVal = Form.useWatch("cpu", form);

  function title() {
    if (boost) {
      return "Booster";
    } else {
      return "Quota upgrades";
    }
  }

  const PARAMS = boost ? BOOST : REGULAR;

  function explainRam() {
    return (
      <>
        {renderRamInfo()}
        {showExplanations ? (
          <>
            This quota limits the total amount of memory a project can use. Note
            that RAM may be limited, if many other users are using the same host
            – though member hosting significantly reduces competition for RAM.
            We recommend at least {MEM_MIN_RECOMMEND}G!
          </>
        ) : undefined}
      </>
    );
  }

  /**
   * When a quota is changed, we warn the user that the preset was adjusted.
   * (the text updates, though, since it rerenders every time). Explanation in
   * the details could make no sense, though – that's why this is added.
   */
  function presetWasAdjusted() {
    setPresetAdjusted?.(true);
  }

  function renderRamInfo() {
    if (ramVal >= RAM_HIGH_WARN_THRESHOLD) {
      return (
        <Alert
          style={WARNING_BOX}
          type="warning"
          message="Consider using a compute server?"
          description={
            <>
              You selected a RAM quota of {ramVal}G. If your use-case involves a
              lot of RAM, consider using a{" "}
              <A href="https://doc.cocalc.com/compute_server.html">
                compute server
              </A>{" "}
              or{" "}
              <A href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </A>
              . This will not only give you much more RAM, but also a far
              superior experience!
            </>
          }
        />
      );
    } else if (!boost && ramVal <= RAM_LOW_WARN_THRESHOLD) {
      return (
        <Alert
          style={WARNING_BOX}
          type="warning"
          message="Low memory"
          description={
            <>
              Your choice of {ramVal}G of RAM is beyond our recommendation of at
              least {MEM_MIN_RECOMMEND}G. You will not be able to run several
              notebooks at once, use SageMath or Julia effectively, etc.
            </>
          }
        />
      );
    }
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
          units={"GB RAM"}
          presets={boost ? [0, 2, 4, 8, 10] : [1, 2, 4, 8, 16]}
        />
      </Form.Item>
    );
  }

  function renderCpuInfo() {
    if (cpuVal >= CPU_HIGH_WARN_THRESHOLD) {
      return (
        <Alert
          style={WARNING_BOX}
          type="warning"
          message="Consider using a compute server?"
          description={
            <>
              You selected a CPU quota of {cpuVal} vCPU cores is high. If your
              use-case involves harnessing a lot of CPU power, consider using a{" "}
              <A href="https://doc.cocalc.com/compute_server.html">
                compute server
              </A>{" "}
              or{" "}
              <A href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </A>
              . This will not only give you many more CPU cores, but also a far
              superior experience!
            </>
          }
        />
      );
    }
  }

  function renderCpuExtra() {
    return (
      <>
        {renderCpuInfo()}
        {showExplanations ? (
          <>
            <A href="https://cloud.google.com/compute/docs/faq#virtualcpu">
              Google Cloud vCPUs.
            </A>{" "}
            To keep prices low, these vCPUs may be shared with other projects,
            though member hosting very significantly reduces competition for
            CPUs.
          </>
        ) : undefined}
      </>
    );
  }

  function cpu() {
    return (
      <Form.Item
        label="Shared CPUs"
        name="cpu"
        initialValue={PARAMS.cpu.dflt}
        extra={renderCpuExtra()}
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
              storage space. We also offer MUCH larger disks (and CPU and
              memory) via{" "}
              <A href="https://doc.cocalc.com/compute_server.html">
                compute server
              </A>
              .
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

    const quotaConfig: Record<string, string> = form.getFieldsValue(
      Object.keys(PRESET_MATCH_FIELDS),
    );
    const invalidConfigValues = Object.keys(quotaConfig).filter(
      (field) => quotaConfig[field] == null,
    );
    if (invalidConfigValues.length) {
      return;
    }

    const presetData: Preset = PRESETS[preset];
    if (presetData == null) {
      return (
        <div>
          Error: preset <code>{preset}</code> is not known.
        </div>
      );
    }
    const { name, descr, details } = presetData;

    const presetDiff = Object.keys(PRESET_MATCH_FIELDS).reduce(
      (diff, presetField) => {
        if (presetData[presetField] !== quotaConfig[presetField]) {
          diff.push(PRESET_MATCH_FIELDS[presetField]);
        }

        return diff;
      },
      [] as string[],
    );

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
      if (preset) {
        const { cpu, disk, ram, uptime, member } = PRESETS[preset];

        const basic = (
          <>
            provides up to{" "}
            <Text strong>
              {cpu} {plural(cpu, "vCPU")}
            </Text>
            , <Text strong>{ram} GB memory</Text>, and{" "}
            <Text strong>{disk} GB disk space</Text> for each project.
          </>
        );

        const mh =
          member === false ? (
            <Text strong>member hosting is disabled</Text>
          ) : null;

        const ut =
          uptime && uptime !== "short" ? (
            <>
              {mh != null ? " and" : ""} the project's{" "}
              <Text strong>idle timeout is {displaySiteLicense(uptime)}</Text>
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
    }

    function presetIsAdjusted() {
      if (!presetAdjusted || !presetDiff.length) return;
      return (
        <Typography style={{ marginBottom: "10px" }}>
          <Text type="warning">
            The currently configured license differs from the selected preset in
            <b> {listFormat.format(presetDiff)}</b>. By clicking any of the
            above buttons, you can ensure your license configuration matches the
            original preset configuration.
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
        {EXPERT_CONFIG}" tab. Subsequent preset selections will reset your
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
    const presetData = PRESETS[val];
    if (presetData != null) {
      const { cpu, ram, disk, uptime = "short", member = true } = presetData;
      form.setFieldsValue({ uptime, member, cpu, ram, disk });
    }
    onChange();
  }

  function presets() {
    return (
      <>
        <Form.Item label="Presets" shouldUpdate={true} extra={presetExtra()}>
          <Radio.Group value={preset}>
            <Space size={[5, 5]} wrap>
              {Object.keys(PRESETS).map((p) => {
                const presetData = PRESETS[p];
                return (
                  <Radio.Button onClick={onPresetChange} key={p} value={p}>
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
          items={[
            {
              key: "preset",
              label: (
                <span>
                  <Icon name="lightbulb" />
                  Quota presets
                </span>
              ),
              children: presets(),
            },
            {
              key: "expert",
              label: (
                <span>
                  <Icon name="wrench" />
                  {EXPERT_CONFIG}
                </span>
              ),
              children: detailed(),
            },
          ]}
        />
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
