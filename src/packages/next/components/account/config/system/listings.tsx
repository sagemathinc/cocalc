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

const desc = {
  page_size: `
Maximum number of files to show before a pager appears.  You can
keep this number pretty larger, because CoCalc uses an efficient
algorithm for scrolling through a large number of directory entries.
`,
};

register({
  path: "system/listings",
  title: "Listings",
  icon: "align-left",
  desc: "Directory listings",
  search: desc,
  Component: () => {
    const { edited, setEdited, original, Save, EditNumber } =
      useEditTable<Data>({
        accounts: { other_settings: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditNumber
          path="other_settings.page_size"
          title="Number of files per page"
          icon="copy"
          desc={desc.page_size}
          min={1}
          max={10000}
          units="files"
        />
      </Space>
    );
  },
});
