/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This is for selecting the "standard" compute images Ubuntu XX.YY, etc.

// cSpell:ignore descr

//import { DownOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Descriptions,
  DescriptionsProps,
  Divider,
  Modal,
  Row,
  Select,
  Space,
  Spin,
} from "antd";
import type { SizeType } from "antd/es/config-provider/SizeContext";
import type { SelectProps } from "antd/lib";
import { fromJS } from "immutable";
import { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Icon,
  Loading,
  Markdown,
  Paragraph,
  Text,
} from "@cocalc/frontend/components";
import {
  ComputeImage,
  ComputeImages,
  ComputeImageTypes,
} from "@cocalc/frontend/custom-software/init";
import {
  compute_image2basename,
  CUSTOM_IMG_PREFIX,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { SoftwareEnvironments } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { SOFTWARE_ENVIRONMENT_ICON } from "./software-consts";
import { SoftwareEnvironmentInformation } from "./software-env-info";
import { SoftwareInfo } from "./types";

//type MenuItem = Required<MenuProps>["items"][number];
type SelectOptions = SelectProps["options"];
type SelectOption = NonNullable<SelectOptions>[number];

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
  onSelect: ({
    id, // image ID, without "custom/" prefix
    display,
    type,
  }: {
    id: string;
    display: string;
    type: ComputeImageTypes;
  }) => void;
  disabled?: boolean;
  size?: SizeType;
  label?: string; // the "okText" on the main button
  changing?: boolean;
  setSoftwareInfo?: (info?) => void;
  hideCustomImages?: boolean; // if true, hide custom images
}

export function ComputeImageSelector({
  current_image,
  onSelect,
  layout,
  disabled = false,
  size = "small",
  label: propsLabel,
  changing = false,
  setSoftwareInfo,
  hideCustomImages = false,
}: ComputeImageSelectorProps) {
  const intl = useIntl();

  const label = propsLabel ?? intl.formatMessage(labels.select);

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

  const specializedSoftware: ComputeImages | undefined = useTypedRedux(
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

  function getComputeImgTitle(name: string) {
    if (is_custom_image(name)) {
      return getCustomImageInfo(compute_image2basename(name)).title;
    } else {
      return (
        getComputeImgInfo(name, "title") ??
        getComputeImgInfo(name, "tag") ??
        name // last resort fallback, in case the img configured in the project no longer exists
      );
    }
  }

  const default_title = getComputeImgTitle(defaultComputeImg);

  function render_menu_children(group: string): SelectOption[] {
    return computeEnvs
      .filter(
        (item) => item.get("group") === group && !item.get("hidden", false),
      )
      .map((img, value) => {
        const registry = img.get("registry");
        const tag = img.get("tag");
        const labelStr = img.get("short") ?? img.get("title") ?? value;
        const label = <>{labelStr}</>;
        const extra = registry && tag ? ` (${registry}:${tag})` : "";
        const title = `${img.get("descr")}${extra}`;
        const searchStr = `${title} ${labelStr}`.toLowerCase();
        return { value, title, label: label as any, searchStr };
      })
      .valueSeq()
      .toJS();
  }

  function render_menu_group(group: string): SelectOption | null {
    const options = render_menu_children(group);
    if (options.length === 0) return null;
    return {
      key: `group-${group}`,
      label: group,
      title: group,
      options,
    };
  }

  function render_special_images(): SelectOption {
    if (specializedSoftware == null) return [];

    const options: SelectOptions = specializedSoftware
      .filter((img) => img.get("type", "") === "custom")
      .sortBy((img) => img.get("display", "").toLowerCase())
      .entrySeq()
      .map((e) => {
        const [id, img] = e;
        const display = img.get("display", "");
        return {
          value: `${CUSTOM_IMG_PREFIX}${id}`,
          label: display,
          title: img.get("desc", display),
          searchStr: img.get("search_str", display.toLowerCase()),
        };
      })
      .toJS();

    return {
      key: "group-specialized",
      label: "Specialized",
      title: "Specialized",
      options,
    };
  }

  function select_options(): SelectOptions {
    const standard = GROUPS.map(render_menu_group).filter((x) => x != null);
    if (hideCustomImages) {
      return standard;
    } else {
      return [...standard, render_special_images()];
    }
  }

  function onSelectHandler(key: string, dialogSave = false) {
    setNextImg(key);
    const info = getImageInfo(key);
    setSoftwareInfo?.(info);
    if (dialogSave || layout !== "dialog") {
      const isCustom = is_custom_image(key);
      const id = isCustom ? compute_image2basename(key) : key;
      onSelect({
        id,
        display: info.title,
        type: isCustom ? "custom" : "standard",
      });
    }
  }

  function render_selector() {
    return (
      <Select
        showSearch
        value={nextImg}
        labelRender={() => getComputeImgTitle(nextImg)}
        disabled={disabled}
        style={{ width: "100%" }}
        filterOption={(input, option) => {
          const s = ((option as any)?.searchStr ?? "").toLowerCase();
          return s.includes(input.toLowerCase());
        }}
        onSelect={(key) => onSelectHandler(key)}
        options={select_options()}
      />
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

  function getCustomImageInfo(id: string): {
    title: string;
    extra?: ReactNode;
    desc: string;
  } {
    const data = specializedSoftware?.get(id);
    if (data == null) {
      // we have a serious problem
      console.warn(`compute_image data missing for '${id}'`);
      return { title: id, desc: "No data available" };
    }
    // some fields are derived in the "Table" when the data comes in
    const img: ComputeImage = data;
    const display = img.get("display") ?? id;
    const desc = img.get("desc", "");
    const url = img.get("url");
    const src = img.get("src");
    const displayTag = img.get("display_tag");

    const render_source = () => {
      if (src == null || src.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          Source: <code>{src}</code>
        </div>
      );
    };

    const render_url = () => {
      if (url == null || url.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          <a href={url} target={"_blank"} rel={"noopener"}>
            <Icon name="external-link" /> Website
          </a>
        </div>
      );
    };

    return {
      title: display,
      desc,
      extra: (
        <div>
          <div style={{ marginTop: "5px" }}>
            Image ID: <code>{displayTag}</code>
          </div>
          <div
            style={{ marginTop: "10px", overflowY: "auto", maxHeight: "200px" }}
          >
            <Markdown value={desc} className={"cc-custom-image-desc"} />
          </div>
          {render_source()}
          {render_url()}
        </div>
      ),
    };
  }

  function getStandardImageInfo(img: string): SoftwareInfo {
    const title = getComputeImgTitle(img);
    const desc =
      getComputeImgInfo(img, "descr") ||
      `(${intl.formatMessage(labels.no_description)})`;
    const registry = getComputeImgInfo(img, "registry");
    const tag = getComputeImgInfo(img, "tag");
    const registryInfo =
      registry && tag ? (
        <Text type="secondary"> ({`${registry}:${tag}`})</Text>
      ) : undefined;
    return { title, desc, registryInfo };
  }

  function getImageInfo(img: string): SoftwareInfo {
    if (is_custom_image(img)) {
      return getCustomImageInfo(compute_image2basename(img));
    } else {
      return getStandardImageInfo(img);
    }
  }

  function render_info(img: string) {
    if (is_custom_image(img)) return null;
    const { desc, registryInfo } = getImageInfo(img);
    return (
      <Text>
        {desc}
        {registryInfo}
      </Text>
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
            onSelectHandler(nextImg, true);
            setShowDialog(false);
          }}
        >
          <>
            <Paragraph>
              <div
                style={{ display: "flex", width: "100%", alignItems: "center" }}
              >
                <div
                  style={{ flex: "0 0 auto", marginRight: "10px" }}
                >{`${intl.formatMessage(labels.select)}:`}</div>
                <div style={{ flex: "1 1 auto" }}>{render_selector()}</div>
              </div>
            </Paragraph>
            {renderDialogHelpContent(nextImg)}
            <Paragraph>{render_doubt()}</Paragraph>
          </>
        </Modal>
      </>
    );
  }

  function renderDialogHelpContent(img) {
    const { title, extra, desc, registryInfo } = getImageInfo(img);

    const items: DescriptionsProps["items"] = [
      {
        label: intl.formatMessage(labels.name),
        children: <Text strong>{title}</Text>,
      },
      {
        label: intl.formatMessage(labels.description),
        children: extra ?? desc,
        style: { maxHeight: "4em", overflowY: "auto" },
      },
    ];

    if (registryInfo) {
      items.push({
        label: "Image", // do not translate, it's a "docker image"
        children: <Text>{registryInfo}</Text>,
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

  // only for standard images, specialized ones have a more complex description in "softwareInfo"
  const description = render_info(nextImg);

  switch (layout) {
    case "compact":
      return render_selector();
    case "horizontal":
      return (
        <>
          <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
            <div style={{ flex: "1 1 auto" }}>{render_selector()}</div>
            <div style={{ flex: "0 0 auto", marginLeft: "10px" }}>
              <HelpIcon title={intl.formatMessage(labels.software_environment)}>
                <FormattedMessage
                  id="custom-software.selector.explanation"
                  defaultMessage={`Select the software environment.
                Either go with the default environment, or select one of the more specialized ones.`}
                />
              </HelpIcon>
            </div>
          </div>
          {description && <Paragraph>{description}</Paragraph>}
        </>
      );
    // used in projects → create new project
    case "dropdown":
      return (
        <Row gutter={[10, 10]}>
          <Col xs={24}>{render_selector()}</Col>
          {description && (
            <Col xs={24}>
              <Text type="secondary">{description}</Text>
            </Col>
          )}
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
              {getComputeImgTitle(current_image)}{" "}
              {renderDialogHelp(current_image)} {renderDialogButton()}
            </Space>
          </Col>
        </Row>
      );
    default:
      unreachable(layout);
      return null;
  }
}
