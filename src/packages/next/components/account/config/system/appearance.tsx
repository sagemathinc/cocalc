import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";
import Checkbox from "components/misc/checkbox";
import { SCHEMA } from "@cocalc/util/schema";

const timestampDesc = `
You can display timestamps either as absolute points in time or relative to
the current time.`;

register({
  path: "system/appearance",
  title: "Appearance",
  icon: "calendar-week",
  desc: "Configure dark mode and how times are displayed.",
  search: "timestamp display " + timestampDesc,
  Component: () => {
    const { edited, setEdited, original, Save } = useEditTable<Data>({
      accounts: { other_settings: null },
    });
    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical">
        {Save}
        <h3>Timestamp Display</h3>
        <div>{timestampDesc}</div>
        <Checkbox
          defaultValue={
            SCHEMA.accounts.user_query?.get?.fields.other_settings
              .time_ago_absolute
          }
          checked={edited.other_settings.time_ago_absolute}
          onChange={(checked) => {
            edited.other_settings.time_ago_absolute = checked;
            setEdited(edited);
          }}
        >
          Display timestamps as absolute points in time.
        </Checkbox>
      </Space>
    );
  },
});
