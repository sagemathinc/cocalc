import { React } from "@cocalc/frontend/app-framework";

export const UpgradeConfirmContent: React.FC = () => (
  <div>
    <ul style={{ margin: "8px 0 0 18px" }}>
      <li>Usually completes in a few seconds.</li>
      <li>On failure the host rolls back to the previous version.</li>
      <li>Workspace containers keep running uninterrupted.</li>
      <li>All users should see websocket reconnects.</li>
    </ul>
    <div style={{ marginTop: 8 }}>
      Currently interrupted: Codex agent turns, and project
      start/backup/restore/move operations.
    </div>
  </div>
);
