import { Alert, Button, Modal, Popconfirm, Popover, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import {
  ACTION_INFO,
  STATE_INFO,
  getTargetState,
} from "@cocalc/util/db-schema/compute-servers";
import { useEffect, useState } from "react";
import { computeServerAction } from "./api";
import costPerHour from "./cost";
import confirmStartComputeServer from "@cocalc/frontend/purchases/pay-as-you-go/confirm-start-compute-server";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default function getActions({
  id,
  state,
  editable,
  setError,
  configuration,
  includeDangerous,
  type,
}): JSX.Element[] {
  if (!editable) {
    return [];
  }
  const s = STATE_INFO[state ?? "off"];
  if (s == null) {
    return [];
  }
  if ((s.actions ?? []).length == 0) {
    return [];
  }
  const v: JSX.Element[] = [];
  for (const action of s.actions) {
    const a = ACTION_INFO[action];
    if (!a) continue;
    if (action == "suspend") {
      if (configuration.cloud != "google-cloud") {
        continue;
      }
      // must have no gpu and <= 208GB of RAM -- https://cloud.google.com/compute/docs/instances/suspend-resume-instance
      if (configuration.acceleratorType) {
        continue;
      }
      // [ ] TODO: we don't have an easy way to check the RAM requirement right now.
    }
    const { label, icon, tip, description, confirm, danger } = a;
    if (danger && !includeDangerous) {
      continue;
    }
    v.push(
      <ActionButton
        style={v.length > 0 ? { marginLeft: "5px" } : undefined}
        key={action}
        id={id}
        action={action}
        label={label}
        icon={icon}
        tip={tip}
        description={description}
        setError={setError}
        confirm={confirm}
        configuration={configuration}
        danger={danger}
        type={type}
      />,
    );
  }
  return v;
}

function ActionButton({
  id,
  action,
  icon,
  label,
  description,
  tip,
  setError,
  confirm,
  configuration,
  danger,
  type,
  style,
}) {
  const [showOnPrem, setShowOnPrem] = useState<boolean>(false);
  const [cost_per_hour, setCostPerHour] = useState<number | null>(null);
  useEffect(() => {
    if (configuration == null) return;
    (async () => {
      try {
        const c = await costPerHour({
          configuration,
          state: getTargetState(action),
        });
        setCostPerHour(c);
      } catch (err) {
        console.log(err);
        setCostPerHour(null);
      }
    })();
  }, [configuration]);
  const [doing, setDoing] = useState<boolean>(false);
  const doAction = async () => {
    if (configuration.cloud == "onprem") {
      setShowOnPrem(true);
      // right now user has to copy paste
      return;
    }
    try {
      setError("");
      if (action == "start" || action == "resume") {
        if (cost_per_hour == null) {
          throw Error(
            "unable to compute cost -- please update the configuration",
          );
        }
        await confirmStartComputeServer({ id, cost_per_hour });
      }
      setDoing(true);
      await computeServerAction({ id, action });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setDoing(false);
    }
  };
  useEffect(() => {
    setDoing(false);
  }, [action]);

  let button = (
    <Button
      style={style}
      disabled={doing}
      type={type}
      onClick={!confirm ? doAction : undefined}
      danger={danger}
    >
      <Icon name={icon} /> {label}{" "}
      {doing && (
        <>
          <div style={{ display: "inline-block", width: "10px" }} />
          <Spin />
        </>
      )}
    </Button>
  );
  if (confirm) {
    button = (
      <Popconfirm
        title={
          <div>
            {label} - Are you sure?
            {action == "deprovision" && (
              <Alert
                showIcon
                style={{ margin: "15px 0", maxWidth: "400px" }}
                type="warning"
                message={
                  "This will delete the boot disk!  This does not touch the files in your project's home directory."
                }
              />
            )}
            {action == "stop" && (
              <Alert
                showIcon
                style={{ margin: "15px 0" }}
                type="info"
                message={
                  "This will safely turn off the VM, and allow you to edit its configuration."
                }
              />
            )}
          </div>
        }
        onConfirm={doAction}
        okText={`Yes, ${label} VM`}
        cancelText="Cancel"
      >
        {button}
      </Popconfirm>
    );
  }

  const content = (
    <>
      {button}
      {showOnPrem && (
        <OnPremGuide
          action={action}
          showOnPrem={showOnPrem}
          setShowOnPrem={setShowOnPrem}
          configuration={configuration}
          id={id}
        />
      )}
    </>
  );
  if (configuration.cloud == "onprem") {
    return content;
  }

  return (
    <Popover
      placement="bottom"
      key={action}
      mouseEnterDelay={1}
      title={
        <div>
          <Icon name={icon} /> {tip}
        </div>
      }
      content={
        <div style={{ width: "400px" }}>
          {description}{" "}
          {cost_per_hour != null && (
            <div style={{ textAlign: "center" }}>
              <MoneyStatistic value={cost_per_hour} title="Cost per hour" />
            </div>
          )}
        </div>
      }
    >
      {content}
    </Popover>
  );
}

function OnPremGuide({ action, showOnPrem, setShowOnPrem, configuration, id }) {
  if (action == "start") {
    return (
      <Modal
        width={800}
        title={
          <>
            <Icon name="server" /> Connect Your On Prem Server to this Project
          </>
        }
        open={showOnPrem}
        onCancel={() => {
          setShowOnPrem(false);
        }}
        onOk={() => {
          setShowOnPrem(false);
        }}
      >
        To connect your on premises compute server to this project:
        <ol style={{ marginTop: "15px" }}>
          <li>
            Create your own Linux virtual machine (VM) that has Docker installed.
            This VM can be anywhere, but needs the ability to create outgoing
            network connections.{" "}
            {configuration.gpu && (
              <span>
                Since you clicked GPU, you must also have an NVIDIA GPU and the
                Cuda 12 drivers installed and working.
              </span>
            )}
            {configuration.arch == "arm64" && (
              <span>
                Since you selected ARM 64, this should be an ARM64 architecture
                VM, e.g., on an M1 Mac.
              </span>
            )}
          </li>
          <li style={{ marginTop: "15px" }}>
            Create a project api key YOUR_API_KEY in this project's settings
          </li>
          <li style={{ marginTop: "15px" }}>
            Run the following code as root in your virtual machine:
          </li>
        </ol>
        <div style={{ marginTop: "15px" }}>
          <CopyToClipBoard
            inputWidth={"700px"}
            value={`curl -fsS https://${window.location.host}${appBasePath}/compute/${id}/onprem/YOUR_API_KEY | bash`}
          />
        </div>
      </Modal>
    );
  }
  return null;
}
