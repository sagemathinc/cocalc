/*
Configuration to automate turning server off via backend maintenance task involving many
different rules:

- idle timeout
- spend limit
- shutdown command

*/

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Flex,
  Modal,
  Space,
  Spin,
  Switch,
} from "antd";
import { useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import Inline from "./inline";
import { IdleTimeout } from "./idle-timeout";
import { SpendLimit } from "./spend-limit";
import { ShutdownCommand } from "./shutdown-command";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components";

export async function saveComputeServer(compute_servers) {
  await webapp_client.async_query({ query: { compute_servers } });
}

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
  savable,
  savedEnabled,
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
        <Button
          type="primary"
          disabled={saving || !savable || justSaved}
          onClick={doSave}
        >
          Save {saving && <Spin style={{ marginLeft: "5px" }} delay={500} />}
        </Button>
      </Space>
      <div style={{ flex: 1 }} />
      {savedEnabled ? (
        <Alert
          style={{ marginLeft: "15px" }}
          type="success"
          showIcon
          message={"Enabled"}
        />
      ) : (
        <Alert
          style={{ marginLeft: "15px" }}
          type="info"
          showIcon
          message={"Disabled"}
        />
      )}
    </Flex>
  );
}

export function AutomaticShutdownModal({ id, project_id, close }) {
  const [help, setHelp] = useState<boolean>(false);
  return (
    <Modal
      width={800}
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
              Configure Automatic Shutdown Strategies
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
      <SpendLimit id={id} project_id={project_id} help={help} />
      <div style={{ height: "15px" }} />
      <ShutdownCommand id={id} project_id={project_id} help={help} />
    </Modal>
  );
}
