import { Space } from "antd";
import CreateBackup from "./create";
import EditBackupSchedule from "./edit-schedule";

export default function Backups() {
  return (
    <Space.Compact>
      <CreateBackup />
      <EditBackupSchedule />
    </Space.Compact>
  );
}
