import { Alert } from "antd";
import { CSSProperties } from "react";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  error: any;
  setError?: (error: any) => void;
  style?: CSSProperties;
  message?;
}
export default function ShowError({
  message = "Error",
  error,
  setError,
  style,
}: Props) {
  if (!error) return null;
  const err = `${error}`.replace(/^Error:/, "").trim();
  return (
    <Alert
      style={style}
      showIcon
      message={message}
      type="error"
      description={
        <div style={{ maxHeight: "150px", overflow: "auto", textWrap: "wrap" }}>
          <StaticMarkdown value={err} />
        </div>
      }
      onClose={() => setError?.("")}
      closable={setError != null}
    />
  );
}
