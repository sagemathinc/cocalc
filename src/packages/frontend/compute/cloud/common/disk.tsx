import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import { Alert, Button, InputNumber, Select, Space, Switch } from "antd";
import { SELECTOR_WIDTH } from "@cocalc/frontend/compute/google-cloud-config";
import { commas, currency, round2up } from "@cocalc/util/misc";
import {
  markup,
  hyperdiskCostParams,
  DEFAULT_HYPERDISK_BALANCED_IOPS,
  DEFAULT_HYPERDISK_BALANCED_THROUGHPUT,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

interface Props {
  setConfig;
  configuration;
  disabled?: boolean;
  priceData;
  state;
  // if noType is shown, do not render anything related to disk types
  noType?: boolean;
  minSizeGb: number;
  maxSizeGb: number;
  computeDiskCost;
  extraHelp?;
  beforeBody?;
  rate?;
}

export default function Disk(props: Props) {
  const {
    setConfig,
    configuration,
    disabled,
    priceData,
    state = "deprovisioned",
    noType,
    minSizeGb,
    maxSizeGb,
    computeDiskCost,
    extraHelp,
    beforeBody,
    rate,
  } = props;
  const [help, setHelp] = useState<boolean>(false);
  const [newDiskSizeGb, setNewDiskSizeGb] = useState<number | null>(
    configuration.diskSizeGb ?? minSizeGb,
  );
  const [newDiskType, setNewDiskType] = useState<string | null>(
    configuration.diskType ?? "pd-standard",
  );
  useEffect(() => {
    setNewDiskSizeGb(configuration.diskSizeGb ?? minSizeGb);
    setNewDiskType(configuration.diskType ?? "pd-standard");
  }, [configuration]);

  useEffect(() => {
    if (newDiskSizeGb == null) {
      return;
    }
    const min = minSizeGb;
    if (newDiskSizeGb < min) {
      setNewDiskSizeGb(min);
    }
  }, [configuration.image]);

  useEffect(() => {
    const min = minSizeGb;
    if ((newDiskSizeGb ?? 0) < min) {
      setConfig({
        diskSizeGb: min,
      });
      setNewDiskSizeGb(min);
    }
  }, [configuration.acceleratorType]);

  const { requiredMachineTypes, supportedMachineTypes } = priceData?.extra?.[
    "hyperdisk-balanced"
  ] ?? { requiredMachineTypes: [], supportedMachineTypes: [] };
  const machineType = configuration.machineType?.split("-")[0];

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <Switch
          size="small"
          checkedChildren={"Help"}
          unCheckedChildren={"Help"}
          style={{ float: "right" }}
          checked={help}
          onChange={(val) => setHelp(val)}
        />
        <b>
          <Icon name="disk-drive" /> Persistent Disk Storage
        </b>
      </div>
      {help && (
        <Alert
          showIcon
          style={{ margin: "15px 0" }}
          type="info"
          message={"Persistent Disk Storage"}
          description={
            <div style={{ color: "#666", margin: "10px 0" }}>
              <p>
                You are charged for storage as long as the server is provisioned
                (even if it is off).{" "}
                <b>
                  If you run out of credit or hit your spending limit and don't
                  pay, then the disk will be automatically deleted.
                </b>
              </p>
              <p>
                While the server is running,{" "}
                <i>
                  you can increase the disk size <b>without</b> restarting the
                  server
                </i>
                , and it will resize within a minute. You do not have to
                manually do anything (e.g., reboot or use command line tools)
                after increasing the disk size.
              </p>
              {extraHelp}
            </div>
          }
        />
      )}{" "}
      {beforeBody}
      <p>
        Configure the size of the persistent disk
        {noType
          ? ""
          : " and the type of storage, which determines how fast the disk is"}
        .
      </p>
      <Space direction="vertical">
        <InputNumber
          style={{ width: SELECTOR_WIDTH }}
          disabled={disabled}
          min={
            state == "deprovisioned"
              ? minSizeGb
              : configuration.diskSizeGb ?? minSizeGb
          }
          max={maxSizeGb}
          value={newDiskSizeGb}
          addonAfter="GB"
          onChange={(diskSizeGb) => {
            setNewDiskSizeGb(diskSizeGb);
          }}
          onBlur={() => {
            if (state == "deprovisioned") {
              // only set on blur or every keystroke rerenders and cause loss of focus.
              setConfig({
                diskSizeGb: newDiskSizeGb ?? minSizeGb,
              });
            }
          }}
        />
        {state != "deprovisioned" &&
          !disabled &&
          newDiskSizeGb != null &&
          (configuration.diskSizeGb ?? minSizeGb) != newDiskSizeGb && (
            <Button
              type="primary"
              onClick={() => {
                setConfig({
                  diskSizeGb: newDiskSizeGb,
                });
              }}
            >
              Enlarge by{" "}
              {newDiskSizeGb - (configuration.diskSizeGb ?? minSizeGb)}{" "}
              GB (additional cost{" "}
              {rate ? <>&nbsp;at {rate}&nbsp;</> : undefined} &nbsp;is&nbsp;
              {currency(
                computeDiskCost({
                  configuration: {
                    ...configuration,
                    diskSizeGb:
                      newDiskSizeGb - (configuration.diskSizeGb ?? minSizeGb),
                  },
                  priceData,
                }) * 730,
              )}
              /month)
            </Button>
          )}
      </Space>
      <div style={{ color: "#666", margin: "10px 0" }}>
        Set the size between{" "}
        {state == "deprovisioned" ? (
          <Button
            size="small"
            onClick={() => {
              setConfig({
                diskSizeGb: minSizeGb,
              });
            }}
          >
            {minSizeGb} GB
          </Button>
        ) : (
          <>{minSizeGb} GB</>
        )}{" "}
        and {commas(maxSizeGb)} GB.
        {state != "deprovisioned" && (
          <>
            {" "}
            <b>
              You can increase the disk size at any time, even while the VM is
              running.{" "}
            </b>
            You <b>cannot decrease the size</b>, without first deprovisioning
            the server.
          </>
        )}
      </div>
      {!noType && (
        <div>
          <Space>
            <Select
              style={{ width: SELECTOR_WIDTH }}
              disabled={
                disabled || (state ?? "deprovisioned") != "deprovisioned"
              }
              value={newDiskType}
              onChange={(diskType) => {
                setNewDiskType(diskType);
                setConfig({ diskType: diskType ?? "pd-standard" });
              }}
              options={[
                {
                  disabled: requiredMachineTypes.includes(machineType),
                  value: "pd-balanced",
                  label: (
                    <div>
                      Balanced (SSD) disk{" "}
                      <div style={{ fontFamily: "monospace", float: "right" }}>
                        {currency(
                          markup({
                            cost:
                              priceData.disks["pd-balanced"]?.prices[
                                configuration.region
                              ] * 730,
                            priceData,
                          }),
                        )}
                        /GB per month
                      </div>
                    </div>
                  ),
                },
                {
                  disabled: requiredMachineTypes.includes(machineType),
                  value: "pd-ssd",
                  label: (
                    <div>
                      Performance (SSD) disk{" "}
                      <div style={{ fontFamily: "monospace", float: "right" }}>
                        {currency(
                          markup({
                            cost:
                              priceData.disks["pd-ssd"]?.prices[
                                configuration.region
                              ] * 730,
                            priceData,
                          }),
                        )}
                        /GB per month
                      </div>
                    </div>
                  ),
                },
                {
                  disabled: requiredMachineTypes.includes(machineType),
                  value: "pd-standard",
                  label: (
                    <div>
                      Standard (HDD) disk{" "}
                      <div style={{ fontFamily: "monospace", float: "right" }}>
                        {currency(
                          markup({
                            cost:
                              priceData.disks["pd-standard"]?.prices[
                                configuration.region
                              ] * 730,
                            priceData,
                          }),
                        )}
                        /GB per month
                      </div>
                    </div>
                  ),
                },
                {
                  disabled: !supportedMachineTypes.includes(machineType),
                  value: "hyperdisk-balanced",
                  label: (
                    <div>
                      Hyperdisk
                      <div style={{ fontFamily: "monospace", float: "right" }}>
                        <HyperdiskCost
                          region={configuration.region}
                          priceData={priceData}
                        />
                      </div>
                    </div>
                  ),
                },
              ]}
            ></Select>
            {configuration.diskType != "hyperdisk-balanced" && (
              <div style={{ marginLeft: "15px" }}>
                <b>Total Cost for {commas(configuration.diskSizeGb)} GB:</b>{" "}
                {currency(
                  markup({
                    cost:
                      configuration.diskSizeGb *
                      priceData.disks[configuration.diskType]?.prices[
                        configuration.region
                      ],
                    priceData,
                  }),
                )}
                /hour or{" "}
                {currency(
                  markup({
                    cost:
                      configuration.diskSizeGb *
                      priceData.disks[configuration.diskType]?.prices[
                        configuration.region
                      ] *
                      730,
                    priceData,
                  }),
                )}
                /month
              </div>
            )}
          </Space>

          {newDiskType == "pd-standard" && (
            <div style={{ marginTop: "10px", color: "#666" }}>
              <b>WARNING:</b> Small standard disks are slow. Expect an extra
              10s-30s of startup time and slower application start. Balanced
              disks are much faster.
            </div>
          )}
          {newDiskType == "hyperdisk-balanced" && (
            <HyperdiskInfo
              diskSizeGb={configuration.diskSizeGb}
              priceData={priceData}
              region={configuration.region}
              style={{ marginTop: "15px" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function HyperdiskCost({ region, priceData }) {
  const { capacity, iops, throughput } = hyperdiskCostParams({
    region,
    priceData,
  });
  const costProvisioned = markup({
    cost:
      iops * DEFAULT_HYPERDISK_BALANCED_IOPS +
      throughput * DEFAULT_HYPERDISK_BALANCED_THROUGHPUT,
    priceData,
  });
  return (
    <div>
      {currency(730 * costProvisioned)} +{" "}
      {currency(
        markup({
          cost: capacity * 730,
          priceData,
        }),
      )}
      /GB per month
    </div>
  );
}

function HyperdiskInfo({ priceData, style, region, diskSizeGb }) {
  const { capacity, iops, throughput } = hyperdiskCostParams({
    region,
    priceData,
  });
  const { requiredMachineTypes, supportedMachineTypes } =
    priceData.extra["hyperdisk-balanced"];
  const costProvisioned = markup({
    cost:
      iops * DEFAULT_HYPERDISK_BALANCED_IOPS +
      throughput * DEFAULT_HYPERDISK_BALANCED_THROUGHPUT,
    priceData,
  });
  const costCapacity = markup({ cost: capacity * diskSizeGb, priceData });
  // NOTE: I did benchmarks and you get about 12MB/s even with 32 cpus.
  // I think th bandwidth is capped by iops/256 = 3000/256 = 11.71875,
  // even though the google docs say it's the min of that and some other
  // huge number (i.e., the docs are backwards and wrong).
  // https://cloud.google.com/compute/docs/disks/hyperdisks#hyperdisks
  // "Min throughput	The greater of IOPS divided by 256 or 140 MBps"
  // But it should be "lesser" not "greater"!
  return (
    <Alert
      style={style}
      showIcon
      type="info"
      message={"Balanced Hyperdisks"}
      description={
        <>
          Balanced hyperdisks provide {commas(DEFAULT_HYPERDISK_BALANCED_IOPS)}{" "}
          <A href="https://cloud.google.com/compute/docs/disks/hyperdisks#hyperdisks">
            IOPS
          </A>{" "}
          for any size disk. They can be used with machine types{" "}
          {supportedMachineTypes.join(", ")} and are required for{" "}
          {requiredMachineTypes.join(", ")}. The monthly cost is a fixed
          provisioning cost, plus a cost per GB of data:
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            {currency(costProvisioned * 730)}... &nbsp;&nbsp;+ &nbsp;&nbsp;
            {diskSizeGb} GB ×{" "}
            {currency(
              markup({
                cost: capacity * 730,
                priceData,
              }),
            )}
            .../GB per month&nbsp;&nbsp;~&nbsp;&nbsp;
            {currency(round2up(730 * (costProvisioned + costCapacity)))} per
            month
          </div>
        </>
      }
    />
  );
}
