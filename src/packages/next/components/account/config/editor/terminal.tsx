import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import IntegerSlider from "components/misc/integer-slider";
import useEditTable from "lib/hooks/edit-table";

interface Data {
  terminal: {
    font_size: number;
  };
}

const descFontSize = `New terminals will use this font size by default. You can change this
for a particular terminal at any time.`;

register({
  path: "editor/terminal",
  title: "Terminal",
  icon: "terminal",
  desc: "Terminal default font size, color theme, etc.",
  search: descFontSize,
  Component: () => {
    const { edited, setEdited, original, Save } = useEditTable<Data>({
      accounts: { terminal: null },
    });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {Save}
        <h2>Font Size</h2>
        <b>Terminal font size:</b>
        {descFontSize}
        <IntegerSlider
          value={edited.terminal.font_size}
          onChange={(font_size) => {
            edited.terminal.font_size = font_size;
            setEdited(edited);
          }}
          min={5}
          max={32}
        />
      </Space>
    );
  },
});
