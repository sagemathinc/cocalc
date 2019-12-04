import { Alert } from "antd";
import { React } from "./app-framework";

export function UpgradeRestartWarning(props: { style?: React.CSSProperties }) {
  const mesg = (
    <span>
      WARNING: When project upgrades change for a project, that project{" "}
      <b>must be restarted</b>, which terminates running computations.
    </span>
  );
  return <Alert type="info" message={mesg} style={props.style} />;
}
