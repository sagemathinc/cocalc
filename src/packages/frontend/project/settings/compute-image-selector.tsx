/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This is for selecting the "standard" compute images Ubuntu XX.YY, etc.

// cSpell:ignore descr

import { DownOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Descriptions,
  DescriptionsProps,
  Divider,
  Dropdown,
  Flex,
  MenuProps,
  Modal,
  Row,
  Space,
  Spin,
} from "antd";
import { SizeType } from "antd/es/config-provider/SizeContext";
import { fromJS } from "immutable";
import { FormattedMessage, useIntl } from "react-intl";

import {
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Gap,
  HelpIcon,
  Icon,
  Loading,
  Paragraph,
  Text,
} from "@cocalc/frontend/components";
import { SoftwareEnvironments } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { capitalize, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { SOFTWARE_ENVIRONMENT_ICON } from "./software-consts";
import { SoftwareEnvironmentInformation } from "./software-env-info";

type MenuItem = Required<MenuProps>["items"][number];

const title = (x) => x.get("short") ?? x.get("title") ?? x.get("id") ?? "";

const cmp_title = (a, b) => {
  const t1: string = title(a);
  const t2: string = title(b);
  return t1.toLowerCase() < t2.toLowerCase() ? 1 : -1;
};

// we want "Default", "Previous", ... to come first, hence "order" trumps "short" title
const img_sorter = (a, b): number => {
  const o1 = a.get("order", 0);
  const o2 = b.get("order", 0);
  if (o1 == o2) {
    return cmp_title(a, b);
  }
  return o1 > o2 ? 1 : -1;
};

interface ComputeImageSelectorProps {
  current_image: string;
  layout: "horizontal" | "compact" | "dialog" | "dropdown";
  onSelect: (img: string) => void;
  disabled?: boolean;
  size?: SizeType;
  label?: string; // the "okText" on the main button
  changing?: boolean;
  customSwitch?: JSX.Element;
  hideSelector?: boolean;
}

export function ComputeImageSelector({
  current_image,
  onSelect,
  layout,
  disabled = false,
  size = "small",
  label: propsLabel,
  changing = false,
  customSwitch,
  hideSelector = false,
}: ComputeImageSelectorProps) {
  const intl = useIntl();

  const label = propsLabel ?? capitalize(intl.formatMessage(labels.select));

  // initialize with the given default
  const [nextImg, setNextImg] = useState<string>(current_image);
  const [showDialog, setShowDialog] = useState<boolean>(false);

  // we need to stay on top of incoming changes unless we're in the dialog
  useEffect(() => {
    if (showDialog) return;
    setNextImg(current_image);
  }, [current_image]);

  const software_envs: SoftwareEnvironments | null = useTypedRedux(
    "customize",
    "software",
  );

  if (software_envs === undefined) {
    return <Loading />;
  }

  if (software_envs === null) {
    return null;
  }

  const computeEnvs = fromJS(software_envs.get("environments")).sort(
    img_sorter,
  );

  const defaultComputeImg = software_envs.get("default");
  const GROUPS: string[] = software_envs.get("groups").toJS();

  function getComputeImgInfo(name, type) {
    return computeEnvs.get(name)?.get(type);
  }

  function getComputeImgTitle(name) {
    return (
      getComputeImgInfo(name, "title") ?? getComputeImgInfo(name, "tag") ?? name // last resort fallback, in case the img configured in the project no longer exists
    );
  }

  const default_title = getComputeImgTitle(defaultComputeImg);
  const current_title = getComputeImgTitle(current_image);
  const selected_title = getComputeImgTitle(nextImg);

  function render_menu_children(group: string): MenuItem[] {
    return computeEnvs
      .filter(
        (item) => item.get("group") === group && !item.get("hidden", false),
      )
      .map((img, key) => {
        const registry = img.get("registry");
        const tag = img.get("tag");
        const labelStr = img.get("short") ?? img.get("title") ?? key;
        const label =
          key === defaultComputeImg ? (
            <Text strong>{labelStr}</Text>
          ) : (
            <>{labelStr}</>
          );
        const extra = registry && tag ? ` (${registry}:${tag})` : "";
        const title = `${img.get("descr")}${extra}`;
        return { key, title, label: label as any };
      })
      .valueSeq()
      .toJS();
  }

  function render_menu_group(group: string): MenuItem {
    const children = render_menu_children(group);
    if (children.length === 0) return null;
    return {
      key: group,
      children,
      label: group,
      type: "group",
    };
  }

  function menu_items(): MenuProps["items"] {
    return GROUPS.map(render_menu_group);
  }

  function getMenu() {
    return {
      onClick: (e) => {
        setNextImg(e.key);
        if (layout !== "dialog") {
          onSelect(e.key);
        }
      },
      style: { maxHeight: "50vh", overflow: "auto" },
      items: menu_items(),
    };
  }

  function render_selector() {
    // returning a placeholder to keep the switch on the right in place
    if (hideSelector) return <span></span>;

    return (
      <Dropdown menu={getMenu()} trigger={["click"]} disabled={disabled}>
        <Button size={size} disabled={disabled} block={layout === "dropdown"}>
          {selected_title} <DownOutlined />
        </Button>
      </Dropdown>
    );
  }

  function render_doubt() {
    return (
      <span style={{ color: COLORS.GRAY, fontSize: "11pt" }}>
        <Divider />
        <FormattedMessage
          id="project.settings.compute-image-selector.doubt"
          defaultMessage={`{default, select,
            true {This is the default selection}
            other {Note: in doubt, select "{default_title}"}}`}
          values={{
            default: nextImg === defaultComputeImg,
            default_title,
          }}
        />
      </span>
    );
  }

  function get_info(img: string) {
    const title = getComputeImgTitle(img);
    const desc =
      getComputeImgInfo(img, "descr") ||
      `(${intl.formatMessage(labels.no_description)})`;
    const registry = getComputeImgInfo(img, "registry");
    const tag = getComputeImgInfo(img, "tag");
    const extra = registry && tag ? `${registry}:${tag}` : null;
    return { title, desc, registry, tag, extra };
  }

  function render_info(img: string) {
    const { desc, extra } = get_info(img);
    return (
      <>
        <Text>{desc}</Text>
        {extra ? (
          <>
            <Text type="secondary"> ({extra})</Text>
          </>
        ) : null}
      </>
    );
  }

  function renderDialogButton() {
    return (
      <>
        <Button
          onClick={() => setShowDialog(true)}
          disabled={changing || showDialog}
          size={size}
        >
          <Icon name="edit" /> {intl.formatMessage(labels.change)}...{" "}
          {changing && <Spin size={"small"} />}
        </Button>

        <Modal
          open={showDialog}
          title={`${intl.formatMessage(labels.software_environment)}`}
          okText={label}
          cancelText={<CancelText />}
          onCancel={() => setShowDialog(false)}
          onOk={() => {
            onSelect(nextImg);
            setShowDialog(false);
          }}
        >
          <>
            <Paragraph>
              {capitalize(intl.formatMessage(labels.select))}
              {": "}
              {render_selector()}
            </Paragraph>
            {renderDialogHelpContent(nextImg)}
            <Paragraph>{render_doubt()}</Paragraph>
          </>
        </Modal>
      </>
    );
  }

  function renderDialogHelpContent(img) {
    const { title, desc, extra } = get_info(img);

    const items: DescriptionsProps["items"] = [
      {
        label: intl.formatMessage(labels.name),
        children: <Text strong>{title}</Text>,
      },
      { label: intl.formatMessage(labels.description), children: desc },
    ];

    if (extra) {
      items.push({
        label: "Image", // do not translate, it's a "docker image"
        children: <Text>{extra}</Text>,
      });
    }

    return (
      <>
        <Descriptions bordered column={1} size={"small"} items={items} />
        <Divider />
        <SoftwareEnvironmentInformation />
      </>
    );
  }

  function renderDialogHelp(img) {
    return (
      <HelpIcon title={intl.formatMessage(labels.software_environment)}>
        {renderDialogHelpContent(img)}
      </HelpIcon>
    );
  }

  switch (layout) {
    case "compact":
      return render_selector();
    case "horizontal":
      return (
        <Row gutter={[10, 10]}>
          <Col xs={24}>
            <Icon name={SOFTWARE_ENVIRONMENT_ICON} />
            <Gap />
            <span style={{ fontSize: "12pt", fontWeight: "bold" }}>
              {render_selector()}
            </span>
            <Gap />
            <span>{render_info(nextImg)}</span>
          </Col>
        </Row>
      );
    // used in projects → create new project
    case "dropdown":
      return (
        <Flex vertical={false} justify={"space-between"} align={"center"}>
          {render_selector()}
          {customSwitch ? customSwitch : undefined}
        </Flex>
      );
    // successor of "vertical", where there is a dialog with a clear indication to click a button
    case "dialog":
      return (
        <Row gutter={[10, 10]} style={{ marginRight: 0, marginLeft: 0 }}>
          <Col xs={24}>
            <Space>
              <Icon
                name={SOFTWARE_ENVIRONMENT_ICON}
                style={{ marginTop: "5px" }}
              />{" "}
              {current_title} {renderDialogHelp(current_image)}{" "}
              {renderDialogButton()}
            </Space>
          </Col>
        </Row>
      );
    default:
      unreachable(layout);
      return null;
  }
}
