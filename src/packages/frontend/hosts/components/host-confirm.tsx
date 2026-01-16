import { Checkbox, Input, Modal, Typography, message } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { HostDeleteOptions, HostStopOptions } from "../types";

export function confirmHostStop({
  hostName,
  onConfirm,
}: {
  hostName: string;
  onConfirm: (opts?: HostStopOptions) => void | Promise<void>;
}) {
  const state = { skip: false };
  Modal.confirm({
    title: `Stop ${hostName}?`,
    content: (
      <div>
        <Typography.Text type="secondary">
          This will create backups for any workspaces that need them.
        </Typography.Text>
        <div style={{ marginTop: 8 }}>
          <Checkbox onChange={(event) => (state.skip = event.target.checked)}>
            Skip backups (force)
          </Checkbox>
        </div>
      </div>
    ),
    okText: "Stop",
    onOk: () => onConfirm({ skip_backups: state.skip }),
  });
}

export function confirmHostDeprovision({
  host,
  onConfirm,
}: {
  host: Host;
  onConfirm: (opts?: HostDeleteOptions) => void | Promise<void>;
}) {
  const state = { name: "", skip: false };
  const hostName = host.name ?? "Host";
  const backup = host.backup_status;
  const total = backup?.total ?? 0;
  const running = backup?.running ?? 0;
  const needs = (backup?.needs_backup ?? 0) + running;
  const status = host.status ?? "off";
  const hostRunning =
    status === "running" ||
    status === "starting" ||
    status === "restarting" ||
    status === "error";
  const modal = Modal.confirm({
    title: `Deprovision ${hostName}?`,
    content: (
      <div>
        <Typography.Text type="secondary">
          Type the host name to confirm deprovisioning.
        </Typography.Text>
        <Input
          style={{ marginTop: 8 }}
          placeholder={hostName}
          onChange={(event) => {
            state.name = event.target.value;
            modal.update({
              okButtonProps: {
                danger: true,
                disabled: state.name.trim() !== hostName,
              },
            });
          }}
        />
        {hostRunning ? (
          <div style={{ marginTop: 8 }}>
            <Checkbox onChange={(event) => (state.skip = event.target.checked)}>
              Skip backups (force)
            </Checkbox>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">
              Host is off, so backups cannot run. Start this host if you want to
              ensure {needs} workspace{needs === 1 ? "" : "s"} are properly
              backed up.
            </Typography.Text>
            {total > 0 && (
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary">
                  Backup status: {total - needs}/{total} up to date.
                </Typography.Text>
              </div>
            )}
          </div>
        )}
      </div>
    ),
    okText: "Deprovision",
    okButtonProps: { danger: true, disabled: true },
    onOk: async () => {
      if (state.name.trim() !== hostName) {
        message.error("Host name does not match.");
        throw new Error("host name does not match");
      }
      await onConfirm({ skip_backups: hostRunning ? state.skip : true });
    },
  });
}
