import { Alert, Button, Modal, Popconfirm, Popover, Spin } from "antd";
import { useEffect, useState } from "react";
import { redux, useStore } from "@cocalc/frontend/app-framework";
import { A, CopyToClipBoard, Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { CancelText } from "@cocalc/frontend/i18n/components";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import confirmStartComputeServer from "@cocalc/frontend/purchases/pay-as-you-go/confirm-start-compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  ACTION_INFO,
  STATE_INFO,
  getTargetState,
  getArchitecture,
} from "@cocalc/util/db-schema/compute-servers";
import { computeServerAction, getApiKey } from "./api";
import costPerHour from "./cost";

export default function getActions({
  id,
  state,
  editable,
  setError,
  configuration,
  editModal,
  type,
  project_id,
}): React.JSX.Element[] {
  if (!editable && !configuration?.allowCollaboratorControl) {
    return [];
  }
  const s = STATE_INFO[state ?? "off"];
  if (s == null) {
    return [];
  }
  if ((s.actions ?? []).length == 0) {
    return [];
  }
  const v: React.JSX.Element[] = [];
  for (const action of s.actions) {
    if (
      !editable &&
      !["stop", "start", "suspend", "resume", "reboot", "deprovision"].includes(
        action,
      )
    ) {
      // non-owner can only do start/stop/suspend/resume/deprovision -- NOT delete.
      continue;
    }
    const a = ACTION_INFO[action];
    if (!a) continue;
    if (action == "suspend") {
      if (configuration.cloud != "google-cloud") {
        continue;
      }
      if (getArchitecture(configuration) == "arm64") {
        // TODO: suspend/resume breaks the clock badly on ARM64, and I haven't
        // figured out a workaround, so don't support it for now.  I guess this
        // is a GCP bug.
        continue;
      }
      // must have no gpu and <= 208GB of RAM -- https://cloud.google.com/compute/docs/instances/suspend-resume-instance
      if (configuration.acceleratorType) {
        continue;
      }
      // [ ] TODO: we don't have an easy way to check the RAM requirement right now.
    }
    if (!editModal && configuration.ephemeral && action == "stop") {
      continue;
    }
    const {
      label,
      icon,
      tip,
      description,
      confirm,
      danger,
      confirmMessage,
      clouds,
    } = a;
    if (danger && !configuration.ephemeral && !editModal) {
      continue;
    }
    if (clouds && !clouds.includes(configuration.cloud)) {
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
        editable={editable}
        description={description}
        setError={setError}
        confirm={confirm}
        configuration={configuration}
        danger={danger}
        confirmMessage={confirmMessage}
        type={type}
        state={state ?? "off"}
        project_id={project_id}
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
  editable,
  description,
  tip,
  setError,
  confirm,
  confirmMessage,
  configuration,
  danger,
  type,
  style,
  state,
  project_id,
}) {
  const [showOnPremStart, setShowOnPremStart] = useState<boolean>(false);
  const [showOnPremStop, setShowOnPremStop] = useState<boolean>(false);
  const [showOnPremDeprovision, setShowOnPremDeprovision] =
    useState<boolean>(false);
  const [cost_per_hour, setCostPerHour] = useState<number | null>(null);
  const [popConfirm, setPopConfirm] = useState<boolean>(false);
  const updateCost = async () => {
    try {
      const c = await costPerHour({
        configuration,
        state: getTargetState(action),
      });
      setCostPerHour(c);
      return c;
    } catch (err) {
      setError(`Unable to compute cost: ${err}`);
      setCostPerHour(null);
      return null;
    }
  };
  useEffect(() => {
    if (configuration == null) return;
    updateCost();
  }, [configuration, action]);
  const customize = useStore("customize");
  const [understand, setUnderstand] = useState<boolean>(false);
  const [doing, setDoing] = useState<boolean>(!STATE_INFO[state]?.stable);

  const doAction = async () => {
    if (action == "start") {
      // check version
      const required =
        customize?.get("version_compute_server_min_project") ?? 0;
      if (required > 0) {
        if (redux.getStore("projects").get_state(project_id) == "running") {
          // only check if running -- if not running, the project will obviously
          // not need a restart, since it isn't even running
          const api = await webapp_client.project_client.api(project_id);
          const version = await api.version(
            0 /* want version of the home base! */,
          );
          if (version < required) {
            setError(
              "You must restart your project to upgrade it to the latest version.",
            );
            return;
          }
        }
      }
    }

    if (configuration.cloud == "onprem") {
      if (action == "start") {
        setShowOnPremStart(true);
      } else if (action == "stop") {
        setShowOnPremStop(true);
      } else if (action == "deprovision") {
        setShowOnPremDeprovision(true);
      }

      // right now user has to copy paste
      return;
    }

    try {
      setError("");
      setDoing(true);
      if (editable && (action == "start" || action == "resume")) {
        let c = cost_per_hour;
        if (c == null) {
          c = await updateCost();
          if (c == null) {
            // error would be displayed above.
            return;
          }
        }
        await confirmStartComputeServer({ id, cost_per_hour: c });
      }
      await computeServerAction({ id, action });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setDoing(false);
    }
  };
  useEffect(() => {
    setDoing(!STATE_INFO[state]?.stable);
  }, [action, state]);

  if (configuration == null) {
    return null;
  }

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
        <span>
          <div style={{ display: "inline-block", width: "10px" }} />
          <Spin />
        </span>
      )}
    </Button>
  );
  if (confirm) {
    button = (
      <Popconfirm
        onOpenChange={setPopConfirm}
        placement="right"
        okButtonProps={{
          disabled: !configuration.ephemeral && danger && !understand,
        }}
        title={
          <div>
            {label} - Are you sure?
            {action == "deprovision" && (
              <Alert
                showIcon
                style={{ margin: "15px 0", maxWidth: "400px" }}
                type="warning"
                message={
                  "This will delete the boot disk!  This does not touch the files in your HOME BASE (what you see when not using a compute server).  This permanently deletes EVERYTHING stored on the compute server, especially in any fast local directories."
                }
              />
            )}
            {action == "stop" && (
              <Alert
                showIcon
                style={{ margin: "15px 0" }}
                type="info"
                message={`This will safely turn off the VM${
                  editable ? ", and allow you to edit its configuration." : "."
                }`}
              />
            )}
            {!configuration.ephemeral && danger && (
              <div>
                {/* ATTN: Not using a checkbox here to WORKAROUND A BUG IN CHROME that I see after a day or so! */}
                <Button onClick={() => setUnderstand(!understand)} type="text">
                  <Icon
                    name={understand ? "check-square" : "square"}
                    style={{ marginRight: "5px" }}
                  />
                  {confirmMessage ??
                    "I understand that this may result in data loss."}
                </Button>
              </div>
            )}
          </div>
        }
        onConfirm={doAction}
        okText={`Yes, ${label} VM`}
        cancelText={<CancelText />}
      >
        {button}
      </Popconfirm>
    );
  }

  const content = (
    <span>
      {button}
      {showOnPremStart && action == "start" && (
        <OnPremGuide
          action={action}
          setShow={setShowOnPremStart}
          configuration={configuration}
          id={id}
          title={
            <div>
              <Icon name="server" /> Connect Your Virtual Machine to CoCalc
            </div>
          }
        />
      )}
      {showOnPremStop && action == "stop" && (
        <OnPremGuide
          action={action}
          setShow={setShowOnPremStop}
          configuration={configuration}
          id={id}
          title={
            <div>
              <Icon name="stop" /> Disconnect Your Virtual Machine from CoCalc
            </div>
          }
        />
      )}
      {showOnPremDeprovision && action == "deprovision" && (
        <OnPremGuide
          action={action}
          setShow={setShowOnPremDeprovision}
          configuration={configuration}
          id={id}
          title={
            <div style={{ color: "darkred" }}>
              <Icon name="trash" /> Disconnect Your Virtual Machine and Remove
              Files
            </div>
          }
        />
      )}
    </span>
  );

  // Do NOT use popover in case we're doing a popconfirm.
  // Two popovers at once is just unprofessional and hard to use.
  // That's why the "open={popConfirm ? false : undefined}" below

  return (
    <Popover
      open={popConfirm ? false : undefined}
      placement="left"
      key={action}
      mouseEnterDelay={1}
      title={
        <div>
          <Icon name={icon} /> {tip}
        </div>
      }
      content={
        <div style={{ width: "400px" }}>
          {description} {editable && <>You will be charged:</>}
          {!editable && <>The owner of this compute server will be charged:</>}
          {cost_per_hour != null && (
            <div style={{ textAlign: "center" }}>
              <MoneyStatistic
                value={cost_per_hour}
                title="Cost per hour"
                costPerMonth={730 * cost_per_hour}
              />
            </div>
          )}
        </div>
      }
    >
      {content}
    </Popover>
  );
}

function OnPremGuide({ setShow, configuration, id, title, action }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        setError("");
        setApiKey(await getApiKey({ id }));
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, []);
  return (
    <Modal
      width={800}
      title={title}
      open={true}
      onCancel={() => {
        setShow(false);
      }}
      onOk={() => {
        setShow(false);
      }}
    >
      {action == "start" && (
        <div>
          You can connect any{" "}
          <b>Ubuntu 22.04 or 24.04 Linux Virtual Machine (VM)</b> with root
          access to this project. This VM can be anywhere (your laptop or a
          cloud hosting providing). Your VM needs to be able to create outgoing
          network connections, but does NOT need to have a public ip address.
          <Alert
            style={{ margin: "15px 0" }}
            type="warning"
            showIcon
            message={<b>USE AN UBUNTU 22.04 or 24.04 VIRTUAL MACHINE</b>}
            description={
              <div>
                You can use any{" "}
                <u>
                  <b>
                    <A href="https://multipass.run/">UBUNTU VIRTUAL MACHINE</A>
                  </b>
                </u>{" "}
                that you have a root acount on.{" "}
                <A href="https://multipass.run/">
                  Multipass is a very easy and free way to install one or more
                  minimal Ubuntu VM's on Windows, Mac, and Linux.
                </A>{" "}
                After you install Multipass, create a VM by pasting this in a
                terminal on your computer (you can increase the cpu, memory and
                disk):
                <CopyToClipBoard
                  inputWidth="600px"
                  style={{ marginTop: "10px" }}
                  value={`multipass launch --name compute-server-${id} --cpus 1 --memory 4G --disk 25G`}
                />
                <br />
                Then launch a terminal shell running in the VM:
                <CopyToClipBoard
                  inputWidth="600px"
                  style={{ marginTop: "10px" }}
                  value={`multipass shell compute-server-${id}`}
                />
              </div>
            }
          />
          {configuration.gpu && (
            <span>
              Since you clicked GPU, you must also have an NVIDIA GPU and the
              Cuda drivers installed and working.{" "}
            </span>
          )}
        </div>
      )}
      <div style={{ marginTop: "15px" }}>
        {apiKey && (
          <div>
            <div style={{ marginBottom: "10px" }}>
              Copy and paste the following into a terminal shell on your{" "}
              <b>Ubuntu Virtual Machine</b>:
            </div>
            <CopyToClipBoard
              inputWidth={"700px"}
              value={`curl -fsS https://${window.location.host}${
                appBasePath.length > 1 ? appBasePath : ""
              }/compute/${id}/onprem/${action}/${apiKey} | sudo bash`}
            />
          </div>
        )}
        {!apiKey && !error && <Spin />}
        <ShowError error={error} setError={setError} />
      </div>
      {action == "stop" && (
        <div>
          This will disconnect your VM from CoCalc and stop it from syncing
          files, running terminals and Jupyter notebooks. Files and software you
          installed will not be deleted and you can start the compute server
          later.
          <Alert
            style={{ margin: "15px 0" }}
            type="warning"
            showIcon
            message={
              <b>
                If you're using{" "}
                <A href="https://multipass.run/">Multipass...</A>
              </b>
            }
            description={
              <div>
                <CopyToClipBoard
                  value={`multipass stop compute-server-${id}`}
                />
                <br />
                HINT: If you ever need to enlarge the disk, do this:
                <CopyToClipBoard
                  inputWidth="600px"
                  value={`multipass stop compute-server-${id} && multipass set local.compute-server-${id}.disk=30G`}
                />
              </div>
            }
          />
        </div>
      )}
      {action == "deprovision" && (
        <div>
          This will disconnect your VM from CoCalc, and permanently delete any
          local files and software you installed into your compute server.
          <Alert
            style={{ margin: "15px 0" }}
            type="warning"
            showIcon
            message={
              <b>
                If you're using{" "}
                <A href="https://multipass.run/">Multipass...</A>
              </b>
            }
            description={
              <CopyToClipBoard
                value={`multipass delete compute-server-${id}`}
              />
            }
          />
        </div>
      )}
      {action == "deprovision" && (
        <div style={{ marginTop: "15px" }}>
          NOTE: This does not delete Docker or any Docker images. Run this to
          delete all unused Docker images:
          <br />
          <CopyToClipBoard value="docker image prune -a" />
        </div>
      )}
    </Modal>
  );
}
