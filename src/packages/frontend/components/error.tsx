import { Alert } from "antd";
import { CSSProperties } from "react";

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
  return (
    <Alert
      style={style}
      showIcon
      message={message}
      type="error"
      description={`${error}`}
      onClose={() => setError?.("")}
      closable={setError != null}
    />
  );
}
