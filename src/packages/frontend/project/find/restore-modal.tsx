import { Alert, Button, Modal, Space, Typography } from "antd";

export default function FindRestoreModal({
  open,
  title,
  path,
  openLabel,
  loading,
  error,
  onRestoreOriginal,
  onRestoreScratch,
  onOpenDirectory,
  onCancel,
}: {
  open: boolean;
  title: string;
  path: string;
  openLabel: string;
  loading: boolean;
  error?: string | null;
  onRestoreOriginal: () => void;
  onRestoreScratch: () => void;
  onOpenDirectory: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <div style={{ marginBottom: "4px", color: "#666" }}>
            Selected path
          </div>
          <Typography.Text code>{path}</Typography.Text>
        </div>
        {error ? <Alert type="error" message={error} /> : null}
        <Space direction="vertical" style={{ width: "100%" }}>
          <Button
            type="primary"
            block
            loading={loading}
            onClick={onRestoreOriginal}
          >
            Restore to original path (overwrite)
          </Button>
          <Button block loading={loading} onClick={onRestoreScratch}>
            Restore to /scratch/&lt;path&gt;
          </Button>
          <Button block onClick={onOpenDirectory} disabled={loading}>
            {openLabel}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}
