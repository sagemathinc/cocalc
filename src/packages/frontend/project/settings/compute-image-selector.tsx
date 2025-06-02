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
  MenuProps,
  Modal,
  Row,
  Space,
  Spin,
  Switch,
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
  A,
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
import { ComputeImages } from "../../custom-software/init";

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
}

export function ComputeImageSelector({
  current_image,
  onSelect,
  layout,
  disabled: propsDisabled,
  size: propsSize,
  label: propsLabel,
  changing = false,
}: ComputeImageSelectorProps) {
  const intl = useIntl();
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");

  const disabled = propsDisabled ?? false;
  const size = propsSize ?? "small";
  const label = propsLabel ?? capitalize(intl.formatMessage(labels.select));
  const [dropdownCustom, setDropdownCustom] = useState(false);

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

  const images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images",
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
    return (
      <Dropdown menu={getMenu()} trigger={["click"]} disabled={disabled}>
        <Button size={size} disabled={disabled}>
          {selected_title} <DownOutlined />
        </Button>
      </Dropdown>
    );
  }

  function render_dropdown_custom() {
    if (!isCoCalcCom) return null;
    return (
      <Space style={{ marginLeft: "20px" }}>
        <Switch
          value={dropdownCustom}
          onChange={setDropdownCustom}
          title={"Switch to select a custom software environment"}
          checkedChildren={"Custom"}
          unCheckedChildren={"Standard"}
        />
        <HelpIcon title="Software Environment">help</HelpIcon>
      </Space>
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
        <Paragraph>
          <FormattedMessage
            id="project.settings.compute-image-selector.software-env-info"
            defaultMessage={`The selected software environment provides all the software, this project can make use of.
            If you need additional software, you can either install it in the project or contact support.
            Learn about <A1>installing Python packages</A1>,
            <A2>Python Jupyter Kernel</A2>,
            <A3>R Packages</A3> and <A4>Julia packages</A4>.`}
            values={{
              A1: (c) => (
                <A
                  href={"https://doc.cocalc.com/howto/install-python-lib.html"}
                >
                  {c}
                </A>
              ),
              A2: (c) => (
                <A
                  href={
                    "https://doc.cocalc.com/howto/custom-jupyter-kernel.html"
                  }
                >
                  {c}
                </A>
              ),
              A3: (c) => (
                <A href={"https://doc.cocalc.com/howto/install-r-package.html"}>
                  {c}
                </A>
              ),
              A4: (c) => (
                <A
                  href={
                    "https://doc.cocalc.com/howto/install-julia-package.html"
                  }
                >
                  {c}
                </A>
              ),
            }}
          />
        </Paragraph>
        {isCoCalcCom ? (
          <Paragraph>
            <FormattedMessage
              id="project.settings.compute-image-selector.software-env-info.cocalc_com"
              defaultMessage={`Learn more about specific environments in the <A1>software inventory</A1>.
              Snapshots of what has been available at a specific point in time
              are available for each line of environments.
              Only the current default environment is updated regularly.`}
              values={{
                A1: (c) => <A href={"https://cocalc.com/software/"}>{c}</A>,
              }}
            />
          </Paragraph>
        ) : undefined}
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
        <Row gutter={[10, 10]}>
          <Col xs={24}>
            <Icon name={SOFTWARE_ENVIRONMENT_ICON} />
            <Gap />
            {render_selector()}
            <Gap />
            {render_dropdown_custom()}
          </Col>
          <Col xs={24}>
            <Paragraph>{render_info(nextImg)}</Paragraph>
            {/* <pre>{JSON.stringify(images?.toJS(), null, 2)}</pre> */}
          </Col>
        </Row>
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
