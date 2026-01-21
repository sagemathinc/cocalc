import { Alert, Button, Modal, Space, Typography } from "antd";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { Loading } from "@cocalc/frontend/components";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { filename_extension } from "@cocalc/util/misc";

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
  preview,
}: {
  open: boolean;
  title: string;
  path: string;
  openLabel: string;
  loading: boolean;
  error?: string | null;
  preview?: {
    loading?: boolean;
    error?: string | null;
    content?: string;
    truncated?: boolean;
  };
  onRestoreOriginal: () => void;
  onRestoreScratch: () => void;
  onOpenDirectory: () => void;
  onCancel: () => void;
}) {
  const ext = filename_extension(path).toLowerCase();
  const mode = codemirrorMode(ext) ?? { name: "text/plain" };
  return (
    <Modal
      title={title}
      open={open}
      width={900}
      style={{ maxWidth: "90vw" }}
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
        {preview ? (
          <div>
            <div style={{ marginBottom: "6px", color: "#666" }}>Preview</div>
            {preview.error ? (
              <Alert type="warning" message={preview.error} />
            ) : preview.loading ? (
              <Loading />
            ) : preview.content != null ? (
              <div
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: "6px",
                  padding: "8px",
                  maxHeight: "60vh",
                  overflow: "auto",
                  background: "#fff",
                }}
              >
                <CodeMirrorStatic
                  value={preview.content}
                  options={{ mode, lineNumbers: true, lineWrapping: false }}
                  style={{ border: 0, padding: 0 }}
                />
                {preview.truncated ? (
                  <Alert
                    style={{ marginTop: "8px" }}
                    type="info"
                    message="Preview truncated to 10MB."
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Space>
    </Modal>
  );
}
