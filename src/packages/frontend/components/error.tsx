import { Alert } from "antd";
import { CSSProperties } from "react";

interface Props {
  error: any;
  setError?: (error: any) => void;
  style?: CSSProperties;
}
export default function ShowError({ error, setError, style }: Props) {
  if (!error) return null;
  return (
    <Alert
      style={style}
      showIcon
      message="Error"
      type="error"
      description={`${error}`}
      onClose={() => setError?.("")}
      closable={setError != null}
    />
  );
}
