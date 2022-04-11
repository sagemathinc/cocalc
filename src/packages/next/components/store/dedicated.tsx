/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";
import { get_local_storage } from "@cocalc/frontend/misc/local-storage";
import { capitalize } from "@cocalc/util/misc";
import { DedicatedDiskTypeNames } from "@cocalc/util/types/dedicated";
import { Divider, Form, Input, Radio } from "antd";
import A from "components/misc/A";
import IntegerSlider from "components/misc/integer-slider";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AddBox, LicenseType } from "./add-box";
import { computeCost, Cost } from "./site-license-cost";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { UsageAndDuration } from "./usage-and-duration";

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
  const [cost, setCost] = useState<Cost | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [durationTypes, setDdurationTypes] = useState<
    "subscriptions" | "range"
  >("subscriptions");
  const [form] = Form.useForm();
  const router = useRouter();

  function validateVM() {}

  function onChange() {
    switch (form.getFieldValue("type")) {
      case "dedicated-disk":
        setDdurationTypes("subscriptions");
        if (form.getFieldValue("period") === "range") {
          form.setFieldsValue({ period: "monthly" });
        }
        break;
      case "dedicated-vm":
        setDdurationTypes("range");
        if (form.getFieldValue("period") !== "range") {
          form.setFieldsValue({ period: "range" });
        }
        validateVM();
        break;
    }
    setCost(computeCost(form.getFieldsValue(true)));
  }

  function getType(item): LicenseType {
    const descr = item.description;
    if (descr.dedicated_disk != null && descr.dedicated_disk !== false) {
      return "dedicated-disk";
    }
    if (descr.dedicated_vm != null && descr.dedicated_vm !== false) {
      return "dedicated-vm";
    }
    throw new Error(`Unable to load license type of ${JSON.stringify(descr)}`);
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
        } catch (err) {
          setCartError(err.message);
        } finally {
          setLoading(false);
        }
        if (item.product == "site-license") {
          form.setFieldsValue({ ...item.description, type: getType(item) });
        }
        onChange();
      })();
    }
    onChange();
  }, []);

  if (loading) {
    return <Loading large center />;
  }

  function renderTypeSelection() {
    return (
      <Form.Item
        initialValue="dedicated-disk"
        name="type"
        label="Dedicated"
        extra={
          showExplanations && (
            <>Select if you want to get a Dedicate Disk or a Virtual Machine.</>
          )
        }
      >
        <Radio.Group
          onChange={(e) => {
            form.setFieldsValue({ type: e.target.value });
            onChange();
          }}
        >
          <Radio.Button key={"disk"} value={"dedicated-disk"}>
            Disk
          </Radio.Button>
          <Radio.Button key={"vm"} value={"dedicated-vm"}>
            Virtual Machine
          </Radio.Button>
        </Radio.Group>
      </Form.Item>
    );
  }

  function renderUsageAndDuration() {
    return (
      <UsageAndDuration
        showExplanations={showExplanations}
        form={form}
        onChange={onChange}
        showUsage={false}
        duration={durationTypes}
      />
    );
  }

  function validateDedicatedDiskName() {
    return {
      validator: async (_, value) => {
        if (value.length < 5)
          return Promise.reject("name must be at least 5 characters");
        if (value.length > 20)
          return Promise.reject("name must be at most 20 characters");
        if (!/^[a-z0-9-]+$/.test(value))
          return Promise.reject(
            "name must consist of lowercase letters, numbers, and hyphens only"
          );
        const serverCheck = await apiPost(
          "licenses/check-disk-name",
          { name: value },
          60
        );
        console.log("serverCheck", serverCheck);
        if (serverCheck) {
          return Promise.reject(serverCheck);
        }
        return Promise.resolve();
      },
    };
  }

  function renderDedicatedDisk() {
    return (
      <>
        <Form.Item
          name="disk-name"
          label="Name"
          hasFeedback
          extra={showExplanations && <>Name of disk</>}
          rules={[{ required: true }, validateDedicatedDiskName]}
        >
          <Input style={{ width: "15em" }} />
        </Form.Item>
        <Form.Item
          name="disk-type"
          label="Type"
          initialValue={"standard"}
          extra={showExplanations && <>more info ...</>}
        >
          <Radio.Group
            onChange={(e) => {
              form.setFieldsValue({ "disk-type": e.target.value });
              onChange();
            }}
          >
            {DedicatedDiskTypeNames.map((type) => (
              <Radio.Button key={type} value={type}>
                {type === "ssd" ? "SSD" : capitalize(type)}
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        <Form.Item
          label="Size"
          name="disk-size_gb"
          initialValue={64}
          extra={showExplanations && <>TODO</>}
        >
          <IntegerSlider
            min={32}
            max={1024}
            step={32}
            onChange={(val) => {
              form.setFieldsValue({ "disk-size_gb": val });
              onChange();
            }}
            units={"GB"}
            presets={[32, 64, 128, 256, 512, 1024]}
          />
        </Form.Item>
      </>
    );
  }

  function renderDedicatedVM() {}

  function renderConfiguration() {
    switch (form.getFieldValue("type")) {
      case "dedicated-disk":
        return renderDedicatedDisk();
      case "dedicated-vm":
        return renderDedicatedVM();
    }
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
        {renderUsageAndDuration()}
        <Divider plain>Confguration</Divider>
        {renderConfiguration()}

        <TitleDescription showExplanations={showExplanations} />
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
          <AddBox
            cost={cost}
            form={form}
            cartError={cartError}
            setCartError={setCartError}
            router={router}
          />
        </Form.Item>
      </Form>
    </div>
  );
}
