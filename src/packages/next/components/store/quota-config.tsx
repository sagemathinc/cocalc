/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Divider, Form } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";

export function QuotaConfig({
  showExplanations,
  form,
  disabled = false,
  onChange,
  boost = false,
}) {
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

  return (
    <>
      <Divider plain>{title()}</Divider>
      <Form.Item
        label="Shared RAM"
        name="ram"
        initialValue={boost ? 0 : 2}
        extra={
          showExplanations ? (
            <>
              Each project using this license can use up to this many GB's of
              RAM. Note that RAM may be limited if many other users are using
              the same host, though member hosting significantly reduces
              competition for RAM. We also offer{" "}
              <a href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </a>{" "}
              with larger memory options.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={min}
          max={16 - adjMax}
          onChange={(ram) => {
            form.setFieldsValue({ ram });
            onChange();
          }}
          units={"G RAM"}
          presets={boost ? [0, 2, 4, 8, 10] : [1, 2, 3, 4, 8, 16]}
        />
      </Form.Item>{" "}
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
              <a href={"/store/dedicated?type=vm"}>
                dedicated virtual machines
              </a>{" "}
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
      <Form.Item
        label="Disk space"
        name="disk"
        initialValue={min}
        extra={
          showExplanations ? (
            <>
              Extra disk space lets you store a larger number of files.
              Snapshots and file edit history is included at no additional
              charge. Each licensed project receives this amount of extra
              storage space. We also offer much larger{" "}
              <a href={"/store/dedicated?type=disk"}>dedicated disks</a>.
            </>
          ) : undefined
        }
      >
        <IntegerSlider
          disabled={disabled}
          min={min}
          max={15 - adjMax * 3}
          onChange={(disk) => {
            form.setFieldsValue({ disk });
            onChange();
          }}
          units={"G Disk"}
          presets={boost ? [0, 5, 10] : [1, 4, 8, 10, 15]}
        />
      </Form.Item>
    </>
  );
}
