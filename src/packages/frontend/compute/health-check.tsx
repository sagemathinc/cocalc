import { Button, Input, InputNumber, Radio, Space } from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { capitalize, plural } from "@cocalc/util/misc";
import {
  type HealthCheck as IHealthCheck,
  HEALTH_CHECK_DEFAULTS,
  HEALTH_CHECK_ACTIONS,
  validatedHealthCheck,
  ACTION_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import { AutomaticShutdownCard } from "./automatic-shutdown";
import { setServerConfiguration } from "./api";
import { isEqual } from "lodash";
import { Icon } from "@cocalc/frontend/components";

export function HealthCheck({ id, project_id, help }) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const [test, setTest] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [healthCheck, setHealthCheck] = useState<Partial<IHealthCheck>>(
    validatedHealthCheck(
      server?.configuration?.healthCheck ?? HEALTH_CHECK_DEFAULTS,
    )!,
  );

  const doTest = async () => {
    try {
      setSaving(true);
      setTest("");
      const resp = await webapp_client.exec({
        filesystem: false,
        compute_server_id: id,
        project_id,
        command: healthCheck.command,
        bash: true,
        err_on_exit: false,
      });
      delete resp.type;
      setTest(JSON.stringify(resp, undefined, 2));
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  };
  const periodSeconds =
    healthCheck.periodSeconds ?? HEALTH_CHECK_DEFAULTS.periodSeconds;
  const failureThreshold =
    healthCheck.failureThreshold ?? HEALTH_CHECK_DEFAULTS.failureThreshold;
  const initialDelaySeconds =
    healthCheck.initialDelaySeconds ??
    HEALTH_CHECK_DEFAULTS.initialDelaySeconds;

  return (
    <AutomaticShutdownCard
      title="Health Check"
      icon="medkit"
      setEnabled={(enabled) => setHealthCheck({ ...healthCheck, enabled })}
      save={async () => {
        await setServerConfiguration({
          id,
          configuration: {
            healthCheck: { ...HEALTH_CHECK_DEFAULTS, ...healthCheck },
          },
        });
      }}
      hasUnsavedChanges={
        !isEqual(
          validatedHealthCheck(
            server.configuration?.healthCheck ?? HEALTH_CHECK_DEFAULTS,
          ),
          validatedHealthCheck(healthCheck),
        ) &&
        healthCheck.failureThreshold != null &&
        healthCheck.periodSeconds != null &&
        healthCheck.timeoutSeconds != null &&
        healthCheck.initialDelaySeconds != null
      }
      savedEnabled={!!server.configuration?.healthCheck?.enabled}
      enabled={healthCheck.enabled}
      saving={saving}
      setSaving={setSaving}
      error={error}
      setError={setError}
      confirmSave={
        healthCheck.action == "deprovision"
          ? "Are you sure?  This could automatically delete data."
          : undefined
      }
    >
      {help && (
        <div>
          <p style={{ marginBottom: "15px" }}>
            Run this bash command on your compute server (from the HOME
            directory) every {periodSeconds} {plural(periodSeconds, "second")}.
            If the command fails{" "}
            {`${failureThreshold} ${plural(failureThreshold, "time")} in a row`}
            , then {healthCheck.action} the compute server.
          </p>
          <ul>
            <li>
              NOTE: If you set the action to "Stop" instead of "Reboot" you can
              use this as an arbitrarily sophisticated way of automatically
              stopping your compute server. E.g., you can make a script that
              monitors GPU usage, then stop the compute server.
            </li>
          </ul>
        </div>
      )}
      <Space direction="vertical" size="large">
        <Space style={{ width: "100%" }} wrap>
          <Input
            style={{ width: "508px" }}
            allowClear
            disabled={saving}
            value={healthCheck.command}
            onChange={(e) =>
              setHealthCheck({ ...healthCheck, command: e.target.value })
            }
            placeholder={`Shell Command (bash) -- ${healthCheck.action} when this fails ${failureThreshold} times...`}
          />
          <InputNumber
            style={{ width: "250px" }}
            disabled={saving}
            min={1}
            step={1}
            value={healthCheck.timeoutSeconds}
            onChange={(timeoutSeconds) =>
              setHealthCheck({
                ...healthCheck,
                timeoutSeconds: timeoutSeconds ?? undefined,
              })
            }
            addonAfter="seconds timeout"
            placeholder="Command timeout..."
          />
        </Space>
        <Space style={{ width: "100%" }} wrap>
          <InputNumber
            style={{ width: "250px" }}
            disabled={saving}
            min={1}
            step={1}
            value={failureThreshold}
            onChange={(failureThreshold) =>
              setHealthCheck({
                ...healthCheck,
                failureThreshold: failureThreshold ?? undefined,
              })
            }
            addonAfter={`attempts before ${healthCheck.action}`}
            placeholder="Failure threshold..."
          />
          <InputNumber
            style={{ width: "250px" }}
            disabled={saving}
            min={60}
            step={30}
            value={periodSeconds}
            onChange={(periodSeconds) =>
              setHealthCheck({
                ...healthCheck,
                periodSeconds: periodSeconds ?? undefined,
              })
            }
            addonAfter="seconds between checks"
            placeholder="Interval..."
          />
          <InputNumber
            style={{ width: "250px" }}
            disabled={saving}
            min={60}
            step={30}
            value={initialDelaySeconds}
            onChange={(initialDelaySeconds) =>
              setHealthCheck({
                ...healthCheck,
                initialDelaySeconds: initialDelaySeconds ?? undefined,
              })
            }
            addonAfter="seconds initial delay"
            placeholder="Initial delay..."
          />
        </Space>
        <Space style={{ width: "100%" }}>
          <div style={{ marginRight: "15px" }}>
            Action when health check fails:
          </div>
          <Radio.Group
            style={{ flex: 1 }}
            disabled={saving}
            options={HEALTH_CHECK_ACTIONS.filter(
              (action) =>
                ACTION_INFO[action].isSupported?.(server.configuration) ?? true,
            ).map((action) => {
              return {
                label: (
                  <>
                    <Icon name={ACTION_INFO[action].icon as any} />{" "}
                    {capitalize(action)}
                  </>
                ),
                value: action,
              };
            })}
            optionType="button"
            buttonStyle="solid"
            value={healthCheck.action ?? HEALTH_CHECK_DEFAULTS.action}
            onChange={(e) => {
              setHealthCheck({ ...healthCheck, action: e.target.value });
            }}
          />
        </Space>
        <div style={{ textAlign: "center" }}>
          <Button
            disabled={
              saving ||
              !healthCheck.command?.trim() ||
              server.state != "running"
            }
            onClick={doTest}
          >
            Test
            {server.state != "running" ? " (start server to test command)" : ""}
          </Button>
        </div>
        {test && (
          <pre
            style={{
              width: "550px",
              overflow: "auto",
              background: "#e8e8e8",
              padding: "15px",
              borderRadius: "15px",
            }}
          >
            {test}
          </pre>
        )}
        <ShowError
          error={error}
          setError={setError}
          style={{ width: "100%" }}
        />
      </Space>
    </AutomaticShutdownCard>
  );
}
