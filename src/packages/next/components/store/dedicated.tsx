/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";
import { get_local_storage } from "@cocalc/frontend/misc/local-storage";
import { money } from "@cocalc/util/licenses/purchase/util";
import {
  DedicatedDiskTypeNames,
  DISK_NAMES,
  VMsType,
} from "@cocalc/util/types/dedicated";
import {
  DEDICATED_DISK_SIZE_INCREMENT,
  MAX_DEDICATED_DISK_SIZE,
  MIN_DEDICATED_DISK_SIZE,
  PRICES,
} from "@cocalc/util/upgrades/dedicated";
import { CostInputPeriod, DateRange } from "@cocalc/util/upgrades/shopping";
import { Divider, Form, Input, Radio, Select, Typography } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import { sortBy } from "lodash";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AddBox } from "./add-box";
import { computeCost } from "./site-license-cost";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { UsageAndDuration } from "./usage-and-duration";
import { getType, loadDateRange } from "./util";

const { Text } = Typography;

const GCP_DISK_URL =
  "https://cloud.google.com/compute/docs/disks/performance#performance_by_disk_size";

export default function DedicatedResource() {
  const router = useRouter();
  return (
    <div>
      <div style={{ maxWidth: "900px", margin: "auto" }}>
        <h3>
          <Icon name={"key"} style={{ marginRight: "5px" }} />{" "}
          {router.query.id != null
            ? "Edit Dedicated Resources License in Shopping Cart"
            : "Buy a Dedicated Resources License"}
        </h3>
        {router.query.id == null && (
          <p>
            A{" "}
            <A href="https://doc.cocalc.com/licenses.html">
              <SiteName /> dedicated resource license
            </A>{" "}
            can be used to outfit your project either with additional disk
            storage or moves your project to a much more powerful virtual
            machine. Create a dedicated resources license below then add it to
            your <A href="/store/cart">shopping cart</A>.
          </p>
        )}
        <CreateDedicatedResource />
      </div>
    </div>
  );
}

function CreateDedicatedResource() {
  // somehow this state is necessary to render the form properly
  const [formType, setFormType] = useState<"disk" | "vm" | null>(null);
  const [cost, setCost] = useState<CostInputPeriod | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [durationTypes, setDdurationTypes] = useState<"monthly" | "range">(
    "monthly"
  );
  const [vmMachine, setVmMachine] = useState<keyof VMsType | null>(null);
  const [diskNameValid, setDiskNameValid] = useState<boolean>(false);
  const [form] = Form.useForm();
  const router = useRouter();

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/cart");
  }, []);

  function fixupDuration() {
    switch (form.getFieldValue("type")) {
      case "disk":
        setDdurationTypes("monthly");
        if (form.getFieldValue("period") === "range") {
          form.setFieldsValue({ period: "monthly" });
        }
        break;
      case "vm":
        setDdurationTypes("range");
        if (form.getFieldValue("period") !== "range") {
          form.setFieldsValue({ period: "range" });
        }
        break;
    }
  }

  function calcCost() {
    const data = form.getFieldsValue(true);

    try {
      switch (data.type) {
        case "disk":
          const size_gb = data["disk-size_gb"];
          const speed = data["disk-speed"];
          if (size_gb == null || speed == null) {
            return; // no data to compute price
          }
          setCost(
            computeCost({
              type: "disk",
              period: "monthly",
              dedicated_disk: {
                type: speed,
                size_gb,
                name: data["disk-name"],
              },
            })
          );
          break;
        case "vm":
          setCost(
            computeCost({
              type: "vm",
              period: "range",
              range: data.range,
              dedicated_vm: {
                machine: data["vm-machine"],
              },
            })
          );
          break;
      }
    } catch (err) {
      console.log(`error computing cost: ${err}`);
      setCost(undefined);
    }
  }

  function onChange() {
    fixupDuration();
    calcCost();
  }

  async function loadItem(item: {
    id: number;
    product: string;
    description: {
      dedicated_disk?: any;
      dedicated_vm?: any;
      range?: DateRange;
    };
  }) {
    if (item.product !== "site-license") {
      throw new Error("not a site license");
    }
    const type = getType(item);
    if (type !== "disk" && type !== "vm") {
      throw new Error(`cannot deal with type ${type}`);
    }
    const conf = item.description;
    switch (type) {
      case "disk":
        const d = conf.dedicated_disk;
        console.log("disk", d);
        form.setFieldsValue({
          type,
          "disk-size_gb": d.size_gb,
          "disk-speed": d.type,
          "disk-name": d.name,
        });
        // we have to re-validate the disk name, b/c name could be taken in the meantime
        // just calling the form to revalidate does not work.
        try {
          await testDedicatedDiskName(d.name);
          setDiskNameValid(true);
        } catch (err) {
          setDiskNameValid(false);
        }
        break;

      case "vm":
        console.log("conf", conf);
        const vm = conf.dedicated_vm?.machine;
        if (PRICES.vms[vm] == null) {
          console.warn(`VM type ${vm} not found`);
        } else {
          form.setFieldsValue({
            "vm-machine": vm,
          });
        }
        form.setFieldsValue({
          type,
          range: loadDateRange(conf.range),
        });
        break;
    }
    // unpacking and configuring the form worked, now we do the type selection to show it
    setFormType(type);
  }

  useEffect(() => {
    const store_site_license_show_explanations = get_local_storage(
      "store_site_license_show_explanations"
    );
    if (store_site_license_show_explanations != null) {
      setShowExplanations(!!store_site_license_show_explanations);
    }
    const { id } = router.query;
    if (id != null) {
      // editing something in the shopping cart
      (async () => {
        let item;
        try {
          setLoading(true);
          item = await apiPost("/shopping/cart/get", { id });
          await loadItem(item);
        } catch (err) {
          setCartError(err.message);
        } finally {
          setLoading(false);
        }
        onChange();
      })();
    }
    onChange();
  }, []);

  useEffect(() => {
    form.validateFields();
  }, [form.getFieldValue("type")]);

  if (loading) {
    return <Loading large center />;
  }

  function renderTypeSelection() {
    return (
      <Form.Item
        name="type"
        label="Dedicated"
        rules={[{ required: true, message: "Please select a type" }]}
        extra={
          showExplanations && (
            <>Select if you want to get a Dedicate Disk or a Virtual Machine.</>
          )
        }
      >
        <Radio.Group
          onChange={(e) => {
            form.resetFields();
            form.setFieldsValue({ type: e.target.value });
            setFormType(e.target.value);
            setCost(undefined);
            setCartError("");
            onChange();
          }}
        >
          <Radio.Button key={"disk"} value={"disk"}>
            Disk
          </Radio.Button>
          <Radio.Button key={"vm"} value={"vm"}>
            Virtual Machine
          </Radio.Button>
        </Radio.Group>
      </Form.Item>
    );
  }

  function renderDurationExplanation() {
    switch (durationTypes) {
      case "monthly":
        return (
          <>
            Currently, disk can be rented on a monthly basis only. Note: you can
            cancel the subscription any time and at the end of the billing
            period the disk – and the data it holds – will be destroyed.
          </>
        );
      case "range":
        return (
          <>
            Dedicated VMs can only be rented for a specific period of time. At
            its end, the node will be stopped and removed, and your project
            moves back to the usual upgrade schema.
          </>
        );
    }
  }

  function renderUsageAndDuration() {
    return (
      <>
        <UsageAndDuration
          extraDuration={renderDurationExplanation()}
          form={form}
          onChange={onChange}
          showUsage={false}
          duration={durationTypes}
          discount={false}
        />
      </>
    );
  }

  async function testDedicatedDiskName(name): Promise<void> {
    const minLength = 6;
    const maxLength = 20;

    if (name == null) {
      throw new Error("Please enter a name.");
    } else if (name.length < minLength) {
      throw new Error(`Name must have at least ${minLength} characters.`);
    } else if (name.length > maxLength) {
      throw new Error(`Name must have at most ${maxLength} characters.`);
    } else if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error(
        "Name must consist of lowercase letters, numbers, and hyphens only."
      );
    }
    // if the above passes, then we can check if the name is available.
    const serverCheck = await apiPost("licenses/check-disk-name", { name }, 60);
    if (serverCheck?.available === true) {
      return;
    } else {
      throw new Error("Please choose a different disk name.");
    }
  }

  /**
   * The disk name will get a prefix like "kucalc-[cluster id]-pd-[namespace]-dedicated-..."
   * It's impossible to the prefix, since the properties of the cluster can change.
   * The total length of the disk name is 63, according to the GCE documentation.
   * https://cloud.google.com/compute/docs/naming-resources#resource-name-format
   * I hope a max length of 20 is sufficiently restrictive.
   */
  function validateDedicatedDiskName() {
    return {
      validator: async (_, name) => {
        try {
          await testDedicatedDiskName(name);
          setDiskNameValid(true);
          return Promise.resolve();
        } catch (err) {
          setDiskNameValid(false);
          return Promise.reject(err.message);
        }
      },
    };
  }

  function renderDedicatedDiskInfo() {
    if (!showExplanations) return;
    return (
      <>
        More information about Dedicated Disks can be found at{" "}
        <A href={GCP_DISK_URL}>GCP: Performance by disk size</A>.
      </>
    );
  }

  function renderDiskPerformance() {
    const size_gb = form.getFieldValue("disk-size_gb");
    const speed = form.getFieldValue("disk-speed");
    if (size_gb == null || speed == null) return;
    const diskID = `${size_gb}-${speed}`;
    const di = PRICES.disks[diskID];
    if (di == null) {
      return (
        <>
          Unknown disk with ID <code>{diskID}</code>.
        </>
      );
    }
    return (
      <>
        Estimated speed: {di.mbps} MB/s sustained throughput and {di.iops} IOPS
        read/write. For more detailed information:{" "}
        <A href={GCP_DISK_URL}>GCP disk performance</A> information.
      </>
    );
  }

  function renderDiskExtra() {
    if (!showExplanations) return;
    return <>Name your disk, it must be a unique.</>;
  }

  // ATTN: the IntegerSlider must be kept in sync with DEDICATED_DISK_SIZES in
  // src/packages/util/upgrades/dedicated.ts
  function renderDedicatedDisk() {
    return (
      <>
        <Form.Item
          name="disk-name"
          label="Name"
          hasFeedback
          extra={renderDiskExtra()}
          rules={[validateDedicatedDiskName]}
        >
          <Input style={{ width: "15em" }} />
        </Form.Item>

        <Form.Item
          label="Size"
          name="disk-size_gb"
          initialValue={MIN_DEDICATED_DISK_SIZE + DEDICATED_DISK_SIZE_INCREMENT}
          extra={
            showExplanations && <>Select the size of the dedicated disk.</>
          }
        >
          <IntegerSlider
            min={MIN_DEDICATED_DISK_SIZE}
            max={MAX_DEDICATED_DISK_SIZE}
            step={DEDICATED_DISK_SIZE_INCREMENT}
            onChange={(val) => {
              form.setFieldsValue({ "disk-size_gb": val });
              onChange();
            }}
            units={"GB"}
            presets={[32, 64, 128, 256, 512, 1024]}
          />
        </Form.Item>

        <Form.Item
          name="disk-speed"
          label="Speed"
          initialValue={"standard"}
          extra={renderDedicatedDiskInfo()}
        >
          <Radio.Group
            onChange={(e) => {
              form.setFieldsValue({ "disk-speed": e.target.value });
              onChange();
            }}
          >
            {DedicatedDiskTypeNames.map((type) => (
              <Radio.Button key={type} value={type}>
                {DISK_NAMES[type]}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        <Form.Item label="Performance">{renderDiskPerformance()}</Form.Item>
      </>
    );
  }

  function renderDedicatedVmInfo() {
    if (!showExplanations) return;
    return (
      <>
        More information about VM types can be found at{" "}
        <A href={"https://cloud.google.com/compute/docs/machine-types"}>
          GCP: machine families
        </A>
        .
      </>
    );
  }

  function renderVmPerformance() {
    if (vmMachine == null) return;
    const { spec } = PRICES.vms?.[vmMachine] ?? {};
    if (spec == null) {
      return (
        <>
          Problem: the specifications of <code>{vmMachine}</code> are not known
        </>
      );
    }
    return (
      <>
        Restarting your project while this license is active, will move your
        project on a virtual machine in <SiteName />
        's cluster. This machine will allow you to use up to {spec.cpu} CPU
        cores and {spec.mem} GB memory.
      </>
    );
  }

  function dedicatedVmOptions() {
    return sortBy(
      Object.entries(PRICES.vms),
      ([_, vm]) => `${1000 + vm.spec.cpu}:${1000 + vm.spec.mem}`
    ).map(([id, vm]: [string, NonNullable<VMsType[string]>]) => {
      return (
        <Select.Option key={id} value={id}>
          <Text>{vm.title ?? vm.spec}</Text>
          <Text style={{ paddingLeft: "1em" }} type="secondary">
            ({money(vm.price_day)} per day)
          </Text>
        </Select.Option>
      );
    });
  }

  function renderDedicatedVM() {
    return (
      <>
        <Form.Item
          label="Type"
          name="vm-machine"
          initialValue={null}
          extra={renderDedicatedVmInfo()}
          rules={[{ required: true, message: "Please select a VM type." }]}
        >
          <Select
            onChange={(val) => {
              form.setFieldsValue({ "vm-machine": val });
              setVmMachine(val);
              onChange();
            }}
          >
            {dedicatedVmOptions()}
          </Select>
        </Form.Item>
        <Form.Item label="Performance">
          <div style={{ paddingTop: "5px" }}>{renderVmPerformance()}</div>
        </Form.Item>
      </>
    );
  }

  function renderConfiguration() {
    switch (formType) {
      case "disk":
        return renderDedicatedDisk();
      case "vm":
        return renderDedicatedVM();
    }
  }

  function renderCost() {
    if (cost == null) return;
    const { input } = cost;
    if (input == null) return;

    const disabled =
      (input.type === "vm" && (input.start == null || input.end == null)) ||
      (input.type === "disk" && !diskNameValid);

    return (
      <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
        <AddBox
          cost={cost}
          form={form}
          cartError={cartError}
          setCartError={setCartError}
          router={router}
          dedicatedItem={true}
          disabled={disabled}
        />
      </Form.Item>
    );
  }

  return (
    <div>
      <Form
        form={form}
        style={{
          marginTop: "15px",
          maxWidth: "900px",
          margin: "auto",
          border: "1px solid #ddd",
          padding: "15px",
        }}
        name="basic"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        autoComplete="off"
        onChange={onChange}
      >
        <ToggleExplanations
          showExplanations={showExplanations}
          setShowExplanations={setShowExplanations}
        />

        {renderTypeSelection()}

        {formType != null && (
          <>
            {renderUsageAndDuration()}

            <Divider plain>Confguration</Divider>
            {renderConfiguration()}

            <TitleDescription showExplanations={showExplanations} />
            {renderCost()}
          </>
        )}
      </Form>
    </div>
  );
}
