import { Alert } from "antd";
import { CSSProperties } from "react";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  error: any;
  setError?: (error: any) => void;
  style?: CSSProperties;
  message?;
  banner?;
  noMarkdown?: boolean;
}
export default function ShowError({
  message = "Error",
  error,
  setError,
  style,
  banner,
  noMarkdown,
}: Props) {
  if (!error) return null;
  const err = `${error}`.replace(/Error:/g, "").trim();
  return (
    <Alert
      banner={banner}
      style={style}
      showIcon
      message={message}
      type="error"
      description={
        <div style={{ maxHeight: "150px", overflow: "auto", textWrap: "wrap" }}>
          {noMarkdown ? err : <StaticMarkdown value={err} />}
        </div>
      }
      onClose={() => setError?.("")}
      closable={setError != null}
    />
  );
}
