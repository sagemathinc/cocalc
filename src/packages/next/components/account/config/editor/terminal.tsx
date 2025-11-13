/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row, Space } from "antd";

import {
  example,
  theme_desc,
} from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import register from "../register";
import { Paragraph, Title } from "components/misc";

interface Data {
  terminal: {
    color_scheme: keyof typeof theme_desc;
    font_size: number;
  };
}

const desc = {
  font_size: `New terminals will use this font size by default. You can change this
for a particular terminal at any time.`,
  color_scheme: `The color scheme used for terminals.`,
  font: `The CoCalc terminal uses your browser's fixed-width font, which you can change in your browser's preferences.`,
} as const;

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
      <Row gutter={[20, 30]}>
        <Col md={24} sm={24}>
          <Save />
        </Col>
        <Col md={14} sm={24}>
          <Space direction="vertical" size="large">
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
            <Space direction="vertical">
              <Title level={2} style={{ marginTop: "15px" }}>
                Font
              </Title>
              <Paragraph>{desc.font}</Paragraph>
            </Space>
          </Space>
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
    );
  },
});
