import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";

const desc = {
  time_ago_absolute: `
You can display timestamps either as absolute points in time or relative to
the current time.`,
};

interface Data {
  other_settings: { time_ago_absolute: boolean };
}

register({
  path: "system/appearance",
  title: "Appearance",
  icon: "calendar-week",
  desc: "Configure dark mode and how times are displayed.",
  search: "timestamp display " + desc,
  Component: () => {
    const { edited, original, Save, EditBoolean } =
      useEditTable<Data>({
        accounts: { other_settings: null },
      });
    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        <Save />
        <EditBoolean
          path="other_settings.time_ago_absolute"
          icon="clock"
          title="Timestamp Display"
          desc={desc.time_ago_absolute}
          label="Display timestamps as absolute points in time"
        />
      </Space>
    );
  },
});
