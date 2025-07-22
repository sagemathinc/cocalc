/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Button,
  Col,
  Divider,
  Flex,
  Form,
  Radio,
  Row,
  Space,
  Tabs,
  Typography,
} from "antd";
import { useEffect, useRef, useState, type JSX } from "react";

import { HelpIcon } from "@cocalc/frontend/components/help-icon";
import { Icon } from "@cocalc/frontend/components/icon";
import { displaySiteLicense } from "@cocalc/util/consts/site-license";
import { plural, unreachable } from "@cocalc/util/misc";
import { BOOST, DISK_DEFAULT_GB, REGULAR } from "@cocalc/util/upgrades/consts";
import type { LicenseSource } from "@cocalc/util/upgrades/shopping";

import PricingItem, { Line } from "components/landing/pricing-item";
import { CSS, Paragraph } from "components/misc";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import {
  COURSE,
  SITE_LICENSE,
  PRESET_MATCH_FIELDS,
  Preset,
  PresetConfig,
} from "./quota-config-presets";

const { Text } = Typography;

const EXPERT_CONFIG = "Expert Configuration";
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
  preset?: Preset | null;
  setPreset?: (preset: Preset | null) => void;
  presetAdjusted?: boolean;
  setPresetAdjusted?: (adjusted: boolean) => void;
  source: LicenseSource;
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
    source,
  } = props;

  const presetsRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);
  const [narrow, setNarrow] = useState<boolean>(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (isClient && entries[0].contentRect.width < 600) {
        setNarrow(true);
      } else {
        setNarrow(false);
      }
    });

    if (presetsRef.current) {
      observer.observe(presetsRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [presetsRef.current]);

  const ramVal = Form.useWatch("ram", form);
  const cpuVal = Form.useWatch("cpu", form);

  function title() {
    if (boost) {
      return "Booster";
    } else {
      switch (source) {
        case "site-license":
          return "Quota Upgrades";
        case "course":
          return "Project Upgrades";
        default:
          unreachable(source);
      }
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
                compute server.
              </A>
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
          presets={boost ? [0, 2, 4, 8, 10] : [4, 8, 16]}
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

  function presetIsAdjusted() {
    if (preset == null) return;
    const presetData: PresetConfig = SITE_LICENSE[preset];
    if (presetData == null) {
      return (
        <div>
          Error: preset <code>{preset}</code> is not known.
        </div>
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

    const presetDiff = Object.keys(PRESET_MATCH_FIELDS).reduce(
      (diff, presetField) => {
        if (presetData[presetField] !== quotaConfig[presetField]) {
          diff.push(PRESET_MATCH_FIELDS[presetField]);
        }

        return diff;
      },
      [] as string[],
    );

    if (!presetAdjusted || !presetDiff.length) return;
    return (
      <Alert
        type="warning"
        style={{ marginBottom: "20px" }}
        message={
          <>
            The currently configured license differs from the selected preset in{" "}
            <strong>{listFormat.format(presetDiff)}</strong>. By clicking any of
            the presets below, you reconfigure your license configuration to
            match the original preset.
          </>
        }
      />
    );
  }

  function renderIdleTimeoutWithHelp(text?: string) {
    return (
      <HelpIcon title="Idle Timeout" extra={text || "idle timeout"}>
        The idle timeout determines how long your project stays running after
        you stop using it. For example, if you work in your project for 2 hours,
        it will keep running during that time. When you close your browser or
        stop working, the project will automatically shut down after the idle
        timeout period. Don't worry - your files are always saved and you can
        restart the project anytime to continue your work exactly where you left
        off.
      </HelpIcon>
    );
  }

  function presetsCommon() {
    if (!showExplanations) return null;
    return (
      <Text type="secondary">
        {preset == null ? (
          <>After selecting a preset, feel free to</>
        ) : (
          <>
            Selected preset <strong>"{SITE_LICENSE[preset]?.name}"</strong>. You
            can
          </>
        )}{" "}
        fine tune the selection in the "{EXPERT_CONFIG}" tab. Subsequent preset
        selections will reset your adjustments.
      </Text>
    );
  }

  function renderNoPresetWarning() {
    if (preset != null) return;
    return (
      <Text type="danger">
        Currently, no preset selection is active. Select a preset above to reset
        your recent changes.
      </Text>
    );
  }

  function renderCoursePresets() {
    const p = preset != null ? COURSE[preset] : undefined;
    let presetInfo: JSX.Element | undefined = undefined;
    if (p != null) {
      const { name, cpu, disk, ram, uptime, note, details } = p;
      const basic = (
        <>
          Each student project will be outfitted with up to{" "}
          <Text strong>
            {cpu} {plural(cpu, "vCPU")}
          </Text>
          , <Text strong>{ram} GB memory</Text>, and{" "}
          <Text strong>{disk} GB disk space</Text> with an{" "}
          <Text strong>
            {renderIdleTimeoutWithHelp()} of {displaySiteLicense(uptime)}
          </Text>
          .
        </>
      );
      presetInfo = (
        <>
          <Paragraph>
            <strong>{name}:</strong> {note} {basic}
          </Paragraph>
          <Paragraph type="secondary">{details}</Paragraph>
        </>
      );
    }

    return (
      <>
        <Form.Item label="Presets">
          <Radio.Group
            size="large"
            value={preset}
            onChange={(e) => onPresetChange(COURSE, e.target.value)}
          >
            <Space direction="vertical">
              {(Object.keys(COURSE) as Array<Preset>).map((p) => {
                const { name, icon, descr } = COURSE[p];
                return (
                  <Radio key={p} value={p}>
                    <span>
                      <Icon name={icon ?? "arrow-up"} />{" "}
                      <strong>{name}:</strong> {descr}
                    </span>
                  </Radio>
                );
              })}
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={null}>{presetInfo}</Form.Item>
      </>
    );
  }

  function renderPresetsNarrow() {
    const p = preset != null ? SITE_LICENSE[preset] : undefined;
    let presetInfo: JSX.Element | undefined = undefined;
    if (p != null) {
      const { name, cpu, disk, ram, uptime, note } = p;
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
      const ut = (
        <>
          the project's{" "}
          <Text strong>
            {renderIdleTimeoutWithHelp()} is {displaySiteLicense(uptime)}
          </Text>
        </>
      );
      presetInfo = (
        <Paragraph>
          <strong>{name}</strong> {basic} Additionally, {ut}. {note}
        </Paragraph>
      );
    }

    return (
      <>
        <Form.Item label="Preset">
          <Radio.Group
            size="large"
            value={preset}
            onChange={(e) => onPresetChange(SITE_LICENSE, e.target.value)}
          >
            <Space direction="vertical">
              {(Object.keys(SITE_LICENSE) as Array<Preset>).map((p) => {
                const { name, icon, descr } = SITE_LICENSE[p];
                return (
                  <Radio key={p} value={p}>
                    <span>
                      <Icon name={icon ?? "arrow-up"} />{" "}
                      <strong>{name}:</strong> {descr}
                    </span>
                  </Radio>
                );
              })}
            </Space>
          </Radio.Group>
        </Form.Item>
        {presetInfo}
      </>
    );
  }

  function renderPresetPanels() {
    if (narrow) return renderPresetsNarrow();

    const panels = (Object.keys(SITE_LICENSE) as Array<Preset>).map(
      (p, idx) => {
        const { name, icon, cpu, ram, disk, uptime, expect, descr, note } =
          SITE_LICENSE[p];
        const active = preset === p;
        return (
          <PricingItem
            key={idx}
            title={name}
            icon={icon}
            style={{ flex: 1 }}
            active={active}
            onClick={() => onPresetChange(SITE_LICENSE, p)}
          >
            <Paragraph>
              <strong>{name}</strong> {descr}.
            </Paragraph>
            <Divider />
            <Line amount={cpu} desc={"CPU"} indent={false} />
            <Line amount={ram} desc={"RAM"} indent={false} />
            <Line amount={disk} desc={"Disk space"} indent={false} />
            <Line
              amount={displaySiteLicense(uptime)}
              desc={renderIdleTimeoutWithHelp("Idle timeout")}
              indent={false}
            />
            <Divider />
            <Paragraph>
              <Text type="secondary">
                In each project, you will be able to:
              </Text>
              <ul>
                {expect.map((what, idx) => (
                  <li key={idx}>{what}</li>
                ))}
              </ul>
            </Paragraph>
            {active && note != null ? (
              <>
                <Divider />
                <Paragraph type="secondary">{note}</Paragraph>
              </>
            ) : undefined}
            <Paragraph style={{ marginTop: "20px", textAlign: "center" }}>
              <Button
                onClick={() => onPresetChange(SITE_LICENSE, p)}
                size="large"
                type={active ? "primary" : undefined}
              >
                {name}
              </Button>
            </Paragraph>
          </PricingItem>
        );
      },
    );
    return (
      <Flex
        style={{ width: "100%" }}
        justify={"space-between"}
        align={"flex-start"}
        gap="10px"
      >
        {panels}
      </Flex>
    );
  }

  function presetExtra() {
    return (
      <Space ref={presetsRef} direction="vertical">
        <div>
          {presetIsAdjusted()}
          {renderPresetPanels()}
          {renderNoPresetWarning()}
        </div>
        {presetsCommon()}
      </Space>
    );
  }

  function onPresetChange(
    preset: { [key: string]: PresetConfig },
    val: Preset,
  ) {
    if (val == null || setPreset == null) return;
    setPreset(val);
    setPresetAdjusted?.(false);
    const presetData = preset[val];
    if (presetData != null) {
      const { cpu, ram, disk, uptime = "short", member = true } = presetData;
      form.setFieldsValue({ uptime, member, cpu, ram, disk });
    }
    onChange();
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
                license. E.g. if your license provides a limit of 2 GB of RAM
                and you add a matching boost license with 3 GB of RAM, you'll
                end up with a total quota limit of 5 GB of RAM.
              </Text>
            </Col>
          </Row>
          {detailed()}
        </>
      );
    } else {
      switch (source) {
        case "site-license":
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
                      <Icon name="gears" style={{ marginRight: "5px" }} />
                      Presets
                    </span>
                  ),
                  children: presetExtra(),
                },
                {
                  key: "expert",
                  label: (
                    <span>
                      <Icon name="wrench" style={{ marginRight: "5px" }} />
                      {EXPERT_CONFIG}
                    </span>
                  ),
                  children: detailed(),
                },
              ]}
            />
          );
        case "course":
          return renderCoursePresets();
        default:
          unreachable(source);
      }
    }
  }

  return (
    <>
      <Divider plain>{title()}</Divider>
      {main()}
    </>
  );
};
