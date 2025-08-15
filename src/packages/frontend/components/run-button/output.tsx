import { CSSProperties } from "react";
import { Alert } from "antd";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
// Important -- we import init-nbviewer , since otherwise NBViewerCellOutput won't
// be able to render any mime types until the user opens a Jupyter notebook.
import NBViewerCellOutput from "@cocalc/frontend/jupyter/nbviewer/cell-output";

export default function Output({
  error,
  output,
  old,
  running,
  style,
}: {
  error?;
  output?;
  old?: boolean;
  running?: boolean;
  style?: CSSProperties;
}) {
  if (error) {
    return (
      <Alert
        type={error ? "error" : "success"}
        style={{
          margin: "5px 0 5px 30px",
        }}
        description={`${error}`}
      />
    );
  }
  return (
    <div>
      {running && (
        <ProgressEstimate seconds={10} style={{ width: "100%" }} delay={1000} />
      )}
      {output != null && (
        <div
          style={{
            color: "#444",
            maxHeight: "50vh",
            overflowY: "auto",
            ...style,
            ...(old || running ? { opacity: 0.4 } : undefined),
          }}
        >
          <NBViewerCellOutput cell={{ output }} hidePrompt />
        </div>
      )}
    </div>
  );
}
