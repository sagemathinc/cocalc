import { Modal, Typography } from "antd";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { HostProjectsTable } from "./host-projects-table";

export function HostProjectsBrowser({
  host,
  open,
  onClose,
}: {
  host: Host;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      width={900}
      title={`Projects on ${host.name ?? host.id}`}
      okText="Close"
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Showing projects assigned to this host. Use “Load more” to page through
        large hosts.
      </Typography.Paragraph>
      <HostProjectsTable host={host} pageSize={200} />
    </Modal>
  );
}
