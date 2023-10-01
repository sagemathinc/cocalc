import { Alert, Button, Popconfirm, Popover, Spin } from "antd";
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

export default function getActions({
  id,
  state,
  editable,
  setError,
  configuration,
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
    const { label, icon, tip, description, confirm } = a;
    v.push(
      <ActionButton
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
}) {
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
      disabled={doing}
      type="text"
      onClick={!confirm ? doAction : undefined}
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
                style={{ margin: "15px 0" }}
                type="warning"
                message={"This will delete all data on the boot disk!!"}
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
        okText={`Yes, ${action} VM`}
        cancelText="Cancel"
      >
        {button}
      </Popconfirm>
    );
  }

  return (
    <Popover
      placement="bottom"
      key={action}
      mouseEnterDelay={0.5}
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
      {button}
    </Popover>
  );
}
