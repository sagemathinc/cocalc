import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  Alert,
  Button,
  InputNumber,
  Select,
  Space,
  Switch,
} from "antd";
import { SELECTOR_WIDTH } from "@cocalc/frontend/compute/google-cloud-config";
import { commas, currency } from "@cocalc/util/misc";
import {
  computeDiskCost,
  markup,
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
  }, [configuration.diskSizeGb]);

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
                (even if it is off), but if you run out of credit or hit your
                spending limit and don't pay, then the disk will be
                automatically deleted.
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
            </div>
          }
        />
      )}{" "}
      <p>
        Configure the size of the disk
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
          configuration.diskSizeGb != null && (
            <Button
              type="primary"
              disabled={configuration.diskSizeGb == newDiskSizeGb}
              onClick={() => {
                setConfig({
                  diskSizeGb: newDiskSizeGb,
                });
              }}
            >
              Enlarge by {newDiskSizeGb - configuration.diskSizeGb}GB{" "}
              (additional cost --{" "}
              {currency(
                computeDiskCost({
                  configuration: {
                    ...configuration,
                    diskSizeGb: newDiskSizeGb - configuration.diskSizeGb,
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
            You cannot decrease the disk size after you increase it, without
            first deprovisioning the server.
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
              ]}
            ></Select>
            <div style={{ marginLeft: "15px" }}>
              <b>Total Cost for {commas(configuration.diskSizeGb)}GB:</b>{" "}
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
          </Space>

          {newDiskType == "pd-standard" && (
            <div style={{ marginTop: "10px", color: "#666" }}>
              <b>WARNING:</b> Small standard disks are slow. Expect an extra
              10s-30s of startup time and slower application start. Balanced
              disks are much faster.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
