/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is for selecting the "standard" compute images Ubuntu XX.YY, etc.

import { DownOutlined } from "@ant-design/icons";
import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { Icon, Space } from "@cocalc/frontend/components";
import {
  COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG,
  DEFAULT_COMPUTE_IMAGE,
  GROUPS,
} from "@cocalc/util/compute-images";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Button, Dropdown, Menu } from "antd";
import { fromJS } from "immutable";

// we want "Default", "Previous", ... to come first, hence "order" trumps "short" title
const img_sorter = (a, b): number => {
  const o1 = a.get("order", 0);
  const o2 = b.get("order", 0);
  if (o1 == o2) {
    return a.get("short") < b.get("short") ? 1 : -1;
  }
  return o1 > o2 ? 1 : -1;
};

// only because that's how all the ui code was written.
const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG).sort(img_sorter);

interface ComputeImageSelectorProps {
  selected_image: string;
  layout: "vertical" | "horizontal";
  onBlur?: () => void;
  onFocus?: () => void;
  onSelect: (e) => void;
}

export const ComputeImageSelector: React.FC<ComputeImageSelectorProps> = (
  props: ComputeImageSelectorProps
) => {
  const { selected_image, onFocus, onBlur, onSelect, layout } = props;

  function compute_image_info(name, type) {
    return COMPUTE_IMAGES.getIn([name, type]);
  }

  const default_title = compute_image_info(DEFAULT_COMPUTE_IMAGE, "title");
  const selected_title = compute_image_info(selected_image, "title");

  function render_group(group) {
    const group_images = COMPUTE_IMAGES.filter(
      (item) => item.get("group") === group && !item.get("hidden", false)
    );
    const items = group_images.map((img, key) => (
      <Menu.Item key={key} title={img.get("descr")}>
        {img.get("short")}
      </Menu.Item>
    ));

    return (
      <Menu.ItemGroup title={group} key={group}>
        {items.valueSeq().toJS()}
      </Menu.ItemGroup>
    );
  }

  function onMenuClick(e) {
    onSelect(e.key);
  }

  function render_menu() {
    return (
      <Menu
        onClick={(e) => onMenuClick(e)}
        style={{ maxHeight: "400px", overflowY: "auto" }}
      >
        {GROUPS.map((group) => render_group(group))}
      </Menu>
    );
  }

  function render_selector() {
    return (
      <Dropdown overlay={render_menu()}>
        <Button onBlur={onBlur} onFocus={onFocus}>
          {selected_title} <DownOutlined />
        </Button>
      </Dropdown>
    );
  }

  function render_doubt() {
    if (selected_image === DEFAULT_COMPUTE_IMAGE) {
      return undefined;
    } else {
      return (
        <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
          <br /> (If in doubt, select "{default_title}")
        </span>
      );
    }
  }

  function render_info(italic: boolean) {
    const desc = compute_image_info(selected_image, "descr");
    return <span>{italic ? <i>{desc}</i> : desc}</span>;
  }

  switch (layout) {
    case "vertical":
      // used in project settings → project control
      return (
        <Col xs={12}>
          <Row style={{ fontSize: "12pt" }}>
            <Icon name={"hdd"} />
            <Space />
            Selected image
            <Space />
            {render_selector()}
            <Space />
            {render_doubt()}
          </Row>
          <Row>{render_info(true)}</Row>
        </Col>
      );
    case "horizontal":
      // used in projects → create new project
      return (
        <Col xs={12}>
          <Icon name={"hdd"} />
          <Space />
          <span style={{ fontSize: "12pt", fontWeight: "bold" }}>
            {render_selector()}
          </span>
          <span style={{ marginLeft: "10px" }}>{render_info(false)}</span>
        </Col>
      );
    default:
      unreachable(layout);
      return null;
  }
};
