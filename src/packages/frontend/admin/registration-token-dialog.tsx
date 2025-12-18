/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Button as AntdButton,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Switch,
} from "antd";
import type { RadioChangeEvent } from "antd";

import { CancelText } from "@cocalc/frontend/i18n/components";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import {
  CUSTOM_PRESET_KEY,
  EPHEMERAL_PRESETS,
  EPHEMERAL_OFF_KEY,
  HOUR_MS,
  msToHours,
  type Token,
} from "./types";

interface RegistrationTokenDialogProps {
  open: boolean;
  isEdit: boolean;
  editingToken: Token | null;
  onCancel: () => void;
  onSave: (values: Token) => Promise<void>;
  onReset: () => void;
  error?: string;
  form: any;
  newRandomToken: () => string;
  saving: boolean;
  licenseInputKey: number;
}

export default function RegistrationTokenDialog({
  open,
  isEdit,
  editingToken,
  onCancel,
  onSave,
  onReset,
  error,
  form,
  newRandomToken,
  saving,
  licenseInputKey,
}: RegistrationTokenDialogProps) {
  const onFinish = async (values) => {
    await onSave(values);
  };

  const onRandom = () => form.setFieldsValue({ token: newRandomToken() });
  const limitMin = editingToken != null ? (editingToken.counter ?? 0) : 0;

  function renderFooter() {
    return [
      <AntdButton key="random" onClick={onRandom}>
        Randomize
      </AntdButton>,
      <AntdButton key="reset" onClick={onReset}>
        Reset
      </AntdButton>,
      <AntdButton key="cancel" onClick={onCancel}>
        <CancelText />
      </AntdButton>,
      <AntdButton
        key="save"
        type="primary"
        onClick={() => form.submit()}
        loading={saving}
      >
        Save
      </AntdButton>,
    ];
  }

  function renderError() {
    if (!error) return null;
    return (
      <Alert type="error" showIcon style={{ marginTop: 12 }} message={error} />
    );
  }

  function renderEphemeralControls() {
    return (
      <Form.Item label="Ephemeral lifetime">
        <Form.Item
          noStyle
          shouldUpdate={(prev, curr) =>
            prev.ephemeral !== curr.ephemeral ||
            prev._ephemeralMode !== curr._ephemeralMode
          }
        >
          {(formInstance) => {
            const ephemeral = formInstance.getFieldValue("ephemeral");
            const mode = formInstance.getFieldValue("_ephemeralMode");
            const customHours = msToHours(ephemeral);

            const selection =
              mode ??
              (ephemeral != null ? CUSTOM_PRESET_KEY : EPHEMERAL_OFF_KEY);

            const handleRadioChange = ({
              target: { value },
            }: RadioChangeEvent) => {
              if (value === EPHEMERAL_OFF_KEY) {
                formInstance.setFieldsValue({
                  ephemeral: undefined,
                  _ephemeralMode: EPHEMERAL_OFF_KEY,
                });
                return;
              }
              if (value === CUSTOM_PRESET_KEY) {
                formInstance.setFieldsValue({
                  ephemeral: ephemeral != null ? ephemeral : HOUR_MS,
                  _ephemeralMode: CUSTOM_PRESET_KEY,
                });
                return;
              }
              const preset = EPHEMERAL_PRESETS.find(
                (option) => option.key === value,
              );
              formInstance.setFieldsValue({
                ephemeral: preset?.value,
                _ephemeralMode: value,
              });
            };

            const handleCustomHoursChange = (hours: number | string | null) => {
              const numeric =
                typeof hours === "string" ? parseFloat(hours) : hours;
              if (typeof numeric === "number" && !isNaN(numeric)) {
                formInstance.setFieldsValue({
                  ephemeral: numeric >= 1 ? numeric * HOUR_MS : HOUR_MS,
                });
              } else {
                formInstance.setFieldsValue({ ephemeral: HOUR_MS });
              }
            };

            return (
              <>
                <Radio.Group value={selection} onChange={handleRadioChange}>
                  <Radio value={EPHEMERAL_OFF_KEY}>Off</Radio>
                  {EPHEMERAL_PRESETS.map(({ key, label }) => (
                    <Radio key={key} value={key}>
                      {label}
                    </Radio>
                  ))}
                  <Radio value={CUSTOM_PRESET_KEY}>Custom</Radio>
                </Radio.Group>
                {selection === CUSTOM_PRESET_KEY && (
                  <div style={{ marginTop: "10px" }}>
                    <InputNumber
                      min={1}
                      step={1}
                      value={customHours ?? 1}
                      onChange={handleCustomHoursChange}
                      placeholder="Enter hours"
                    />{" "}
                    hours
                  </div>
                )}
              </>
            );
          }}
        </Form.Item>
      </Form.Item>
    );
  }

  function renderRestrictions() {
    return (
      <Form.Item label="Restrictions">
        <Space direction="vertical">
          <Form.Item
            name={["customize", "disableCollaborators"]}
            valuePropName="checked"
            noStyle
          >
            <Checkbox>Disable configuring collaborators</Checkbox>
          </Form.Item>
          <Form.Item
            name={["customize", "disableAI"]}
            valuePropName="checked"
            noStyle
          >
            <Checkbox>Disable artificial intelligence</Checkbox>
          </Form.Item>
          <Form.Item
            name={["customize", "disableInternet"]}
            valuePropName="checked"
            noStyle
          >
            <Checkbox>Disable internet access</Checkbox>
          </Form.Item>
        </Space>
      </Form.Item>
    );
  }

  function renderLicense() {
    return (
      <Form.Item
        name={["customize", "license"]}
        label="License"
        extra="Optional: Apply a site license to projects created via this token"
      >
        <SiteLicenseInput
          key={licenseInputKey}
          defaultLicenseId={form.getFieldValue(["customize", "license"])}
          onChange={(licenseId) =>
            form.setFieldValue(["customize", "license"], licenseId)
          }
        />
      </Form.Item>
    );
  }

  function renderForm() {
    return (
      <Form
        form={form}
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        size="middle"
        onFinish={onFinish}
      >
        <Form.Item name="token" label="Token" rules={[{ required: true }]}>
          <Input disabled={true} />
        </Form.Item>
        <Form.Item
          name="descr"
          label="Description"
          rules={[{ required: false }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="expires" label="Expires" rules={[{ required: false }]}>
          <DatePicker />
        </Form.Item>
        <Form.Item name="limit" label="Limit" rules={[{ required: false }]}>
          <InputNumber min={limitMin} step={1} />
        </Form.Item>
        <Form.Item name="ephemeral" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="_ephemeralMode" hidden>
          <Input />
        </Form.Item>
        {renderEphemeralControls()}
        {renderRestrictions()}
        {renderLicense()}
        <Form.Item name="active" label="Active" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    );
  }

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit Registration Token" : "Create Registration Token"}
      width={800}
      destroyOnHidden={true}
      maskClosable={false}
      onCancel={onCancel}
      footer={renderFooter()}
    >
      {renderForm()}
      {renderError()}
    </Modal>
  );
}
