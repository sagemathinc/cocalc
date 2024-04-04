import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  Alert,
  Button,
  Divider,
  InputNumber,
  Select,
  Space,
  Switch,
} from "antd";
import { SELECTOR_WIDTH } from "@cocalc/frontend/compute/google-cloud-config";
import ExcludeFromSync from "@cocalc/frontend/compute/exclude-from-sync";
import { currency } from "@cocalc/util/misc";
import {
  computeDiskCost,
  markup,
} from "@cocalc/util/compute/cloud/google-cloud/compute-cost";

export default function Disk(props) {
  const {
    setConfig,
    configuration,
    disabled,
    priceData,
    state = "deprovisioned",
    IMAGES,
  } = props;

  const [help, setHelp] = useState<boolean>(false);
  const [newDiskSizeGb, setNewDiskSizeGb] = useState<number | null>(
    configuration.diskSizeGb ?? getMinDiskSizeGb({ configuration, IMAGES }),
  );
  const [newDiskType, setNewDiskType] = useState<string | null>(
    configuration.diskType ?? "pd-standard",
  );
  useEffect(() => {
    setNewDiskSizeGb(
      configuration.diskSizeGb ?? getMinDiskSizeGb({ configuration, IMAGES }),
    );
    setNewDiskType(configuration.diskType ?? "pd-standard");
  }, [configuration.diskSizeGb]);

  useEffect(() => {
    if (newDiskSizeGb == null) {
      return;
    }
    const min = getMinDiskSizeGb({ configuration, IMAGES });
    if (newDiskSizeGb < min) {
      setNewDiskSizeGb(min);
    }
  }, [configuration.image]);

  useEffect(() => {
    const min = getMinDiskSizeGb({ configuration, IMAGES });
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
        Configure the size of the disk and the type of storage, which determines
        how fast the disk is.
      </p>
      <Space direction="vertical">
        <InputNumber
          style={{ width: SELECTOR_WIDTH }}
          disabled={disabled}
          min={
            state == "deprovisioned"
              ? getMinDiskSizeGb({ configuration, IMAGES })
              : configuration.diskSizeGb ?? getMinDiskSizeGb(configuration)
          }
          max={65536}
          value={newDiskSizeGb}
          addonAfter="GB"
          onChange={(diskSizeGb) => {
            setNewDiskSizeGb(diskSizeGb);
          }}
          onBlur={() => {
            if (state == "deprovisioned") {
              // only set on blur or every keystroke rerenders and cause loss of focus.
              setConfig({
                diskSizeGb:
                  newDiskSizeGb ?? getMinDiskSizeGb({ configuration, IMAGES }),
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
                diskSizeGb: getMinDiskSizeGb({ configuration, IMAGES }),
              });
            }}
          >
            {getMinDiskSizeGb({ configuration, IMAGES })} GB
          </Button>
        ) : (
          <>{getMinDiskSizeGb({ configuration, IMAGES })} GB</>
        )}{" "}
        and 65,536 GB.
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
      <div>
        <Space>
          <Select
            style={{ width: SELECTOR_WIDTH }}
            disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
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
            <b>Total Cost for {configuration.diskSizeGb}GB:</b>{" "}
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
            10s-30s of startup time and slower application start. Balanced disks
            are much faster.
          </div>
        )}
        <Divider />
        <ExcludeFromSync
          {...props}
          style={{ marginTop: "10px", color: "#666" }}
        />
      </div>
    </div>
  );
}
