/*
Configuration to automate turning server off via backend maintenance task involving many
different rules:

- idle timeout
- spend limit

*/

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
} from "antd";
import { useState } from "react";
import Inline from "./inline";
import { IdleTimeout } from "./idle-timeout";
import { SpendLimit } from "./spend-limit";
import { HealthCheck } from "./health-check";
import { ShutdownTime } from "./shutdown-time";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components";

export function AutomaticShutdownCard(props) {
  return (
    <Card
      styles={{
        body: props.enabled ? undefined : { display: "none" },
        title: { fontSize: "15px" },
      }}
      title={<CardTitle {...props} />}
    >
      {props.children}
      <ShowError
        error={props.error}
        setError={props.setError}
        style={{ width: "100%", marginTop: "15px" }}
      />
    </Card>
  );
}

function CardTitle({
  icon,
  title,
  enabled,
  setEnabled,
  saving,
  setSaving,
  setError,
  save,
  hasUnsavedChanges,
  savedEnabled,
  confirmSave = false,
}) {
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const doSave = async () => {
    try {
      setSaving(true);
      setJustSaved(true);
      await save();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
      setTimeout(() => {
        setJustSaved(false);
      }, 1000);
    }
  };
  let saveButton = (
    <Button
      type="primary"
      disabled={saving || !hasUnsavedChanges || justSaved}
      onClick={confirmSave ? undefined : doSave}
    >
      <Icon name="save" /> Save{" "}
      {saving && <Spin style={{ marginLeft: "5px" }} delay={500} />}
    </Button>
  );
  if (confirmSave) {
    saveButton = (
      <Popconfirm title={confirmSave} onConfirm={doSave}>
        {saveButton}
      </Popconfirm>
    );
  }
  return (
    <Flex style={{ alignItems: "center" }}>
      <div
        style={{
          width: "150px",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <Icon name={icon as any} style={{ marginRight: "10px" }} /> {title}
      </div>
      <div style={{ flex: 1 }} />
      <Space>
        <Checkbox
          disabled={saving}
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
          }}
        >
          Enable{enabled ? "d" : ""}
        </Checkbox>
        {saveButton}
      </Space>
      <div style={{ flex: 1 }} />
      <div style={{ marginLeft: "15px", width: "105px" }}>
        {savedEnabled ? (
          <Alert type="success" showIcon message={"Enabled"} />
        ) : undefined}
      </div>
    </Flex>
  );
}

export function AutomaticShutdownModal({ id, project_id, close }) {
  const [help, setHelp] = useState<boolean>(false);
  return (
    <Modal
      width={900}
      open
      onCancel={close}
      onOk={close}
      cancelText="Close"
      okButtonProps={{ style: { display: "none" } }}
      title={
        <div>
          <Inline
            id={id}
            style={{
              display: "block",
              textAlign: "center",
              margin: "-5px 15px 5px 0",
            }}
          />
          <Flex style={{ marginRight: "20px", alignItems: "center" }}>
            <div style={{ fontSize: "18px", margin: "15px 0" }}>
              Configure Automatic Shutdown and Health Check Strategies
            </div>
            <div style={{ flex: 1 }} />
            <Switch
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
          </Flex>
          {help && (
            <div style={{ fontSize: "14px", fontWeight: "normal" }}>
              <Button
                href="https://youtu.be/Kx_47fs_xcI"
                target="_blank"
                style={{ float: "right" }}
              >
                <Icon name="youtube" style={{ color: "red" }} />
                YouTube Video
              </Button>
              Each strategy automatically turns this compute server off when a
              condition is met. This can save you money keeping spending under
              control. When the server is shutdown, a message is also sent and a
              log entry is created.
            </div>
          )}
        </div>
      }
    >
      <IdleTimeout id={id} project_id={project_id} help={help} />
      <div style={{ height: "15px" }} />
      <ShutdownTime id={id} project_id={project_id} help={help} />
      <div style={{ height: "15px" }} />
      <SpendLimit id={id} project_id={project_id} help={help} />
      <div style={{ height: "15px" }} />
      <HealthCheck id={id} project_id={project_id} help={help} />
    </Modal>
  );
}
