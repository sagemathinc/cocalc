import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import IntegerSlider from "components/misc/integer-slider";
import useEditTable from "lib/hooks/edit-table";
import { SCHEMA } from "@cocalc/util/schema";

interface Data {
  other_settings: {
    page_size: number;
  };
}

const descNumFiles = `
Maximum number of files to show before a pager appears.  You can
keep this number pretty larger, because CoCalc uses an efficient
algorithm for scrolling through a large number of directory entries.
`;

register({
  path: "system/listings",
  title: "Listings",
  icon: "align-left",
  desc: "Directory listings",
  search: descNumFiles,
  Component: () => {
    const { edited, setEdited, original, Save } = useEditTable<Data>({
      accounts: { other_settings: null },
    });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {Save}
        <b>Number of files per page:</b>
        {descNumFiles}
        <IntegerSlider
          value={edited.other_settings.page_size}
          units={"files"}
          onChange={(page_size) => {
            edited.other_settings.page_size = page_size;
            setEdited(edited);
          }}
          min={1}
          max={10000}
          defaultValue={
            SCHEMA.accounts.user_query?.get?.fields.other_settings?.page_size
          }
        />
      </Space>
    );
  },
});
