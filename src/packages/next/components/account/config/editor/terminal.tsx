import { Col, Row, Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";
import {
  theme_desc,
  example,
} from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";

interface Data {
  terminal: {
    font_size: number;
  };
}

const desc = {
  font_size: `New terminals will use this font size by default. You can change this
for a particular terminal at any time.`,
  color_scheme: `TODO`,
  font: `The CoCalc terminal uses your browsers default fixed-width monospace font, which you can change in browser preferences.`,
};

register({
  path: "editor/terminal",
  title: "Terminals",
  icon: "terminal",
  desc: "Terminal default font size, color theme, etc.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditNumber, EditSelect } =
      useEditTable<Data>({
        accounts: { terminal: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Row>
          <Col md={14} sm={24}>
            <Save />
            <EditNumber
              path="terminal.font_size"
              title="Terminal Font Size"
              icon="text-height"
              desc={desc.font_size}
              min={5}
              max={32}
              units="px"
            />
            <EditSelect
              path="terminal.color_scheme"
              icon="colors"
              desc={desc.color_scheme}
              options={theme_desc}
              style={{ width: "30ex" }}
            />
            <h3>Font</h3>
            {desc.font}
          </Col>
          <Col md={10} sm={24}>
            <h3 style={{ marginTop: "10px" }}>Preview</h3>
            <div
              style={{
                fontSize: `${edited.terminal.font_size}px`,
                overflow: "hidden",
              }}
              dangerouslySetInnerHTML={{
                __html: example(edited.terminal.color_scheme),
              }}
            />
          </Col>
        </Row>
      </Space>
    );
  },
});
