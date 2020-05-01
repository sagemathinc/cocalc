import { React} from "../../app-framework";
import { Well, Button, ButtonToolbar } from "../../antd-bootstrap";
import { UpgradeRestartWarning } from "../../upgrade-restart-warning";

export function ResetProjectsConfirmation({
  on_confirm,
  on_cancel,
}: {
  on_confirm: (e?: any) => void;
  on_cancel: (e?: any) => void;
}) {
  return (
    <Well
      style={{ marginBottom: "0px", marginTop: "10px", background: "white" }}
    >
      Are you sure you want to remove all upgrades that you have contributed to
      these projects?
      <br />
      Your upgrades will then be available to use on projects.
      <br />
      <UpgradeRestartWarning
        style={{ display: "inline-block", margin: "15px 0" }}
      />
      <ButtonToolbar>
        <Button bsStyle="warning" onClick={on_confirm}>
          Yes, please remove all upgrades
        </Button>
        <Button onClick={on_cancel}>Cancel</Button>
      </ButtonToolbar>
    </Well>
  );
}
