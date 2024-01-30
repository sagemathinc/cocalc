import { Checkbox, Input, Tag, Tooltip } from "antd";
import { CheckboxChangeEvent } from "antd/es/checkbox";

import { Icon } from "@cocalc/frontend/components/icon";
import { file_associations } from "@cocalc/frontend/file-associations";
import { CONTACT_TAG, TAGS } from "@cocalc/util/db-schema/accounts";
import {
  getRandomColor,
  plural,
  smallIntegerToEnglishWord,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { CSS } from "components/misc";

interface Props {
  tags: Set<string>;
  setTags: (tags: Set<string>) => void;
  signupReason: string;
  setSingupReason: (reason: string) => void;
  minTags: number;
  what: string;
  style?: CSS;
  contact?: boolean; // if true, add checkbox to be "contacted" below, which adds a "contact" tag
}

export default function Tags({
  tags,
  setTags,
  signupReason,
  setSingupReason,
  minTags,
  style,
  what,
  contact = false,
}: Props) {
  const handleTagChange = (tag: string, checked: boolean) => {
    if (checked) {
      tags.add(tag);
    } else {
      tags.delete(tag);
    }
    setTags(new Set(tags));
  };

  function onContact(e: CheckboxChangeEvent) {
    handleTagChange(CONTACT_TAG, e.target.checked);
  }

  function renderContact() {
    if (!contact) return;
    const checked = tags.has(CONTACT_TAG);
    return (
      <>
        <Checkbox
          style={{
            margin: "20px 0 20px 0",
            fontSize: "12pt",
            color: COLORS.GRAY_M,
          }}
          checked={checked}
          onChange={onContact}
        >
          Do you want us to contact you? We will help you getting started or
          just introduce CoCalc to you!
        </Checkbox>
        {checked ? (
          <Input
            addonBefore="Intended use:"
            placeholder="Tell us how you intend to use CoCalc."
            style={{ width: "100%" }}
            status={!signupReason.trim() ? "error" : undefined}
            onChange={(e) => {
              setSingupReason(e.target.value);
            }}
          />
        ) : undefined}
      </>
    );
  }

  function renderTags() {
    return TAGS.map(({ label, tag, icon, color, description }) => {
      const tagColor =
        color ?? getRandomColor(tag, { min: 140, max: 170, diff: 0 });
      const iconName = icon ?? file_associations[tag]?.icon;
      const tagElement = (
        <Tag
          style={{
            fontSize: "14px",
            width: "125px",
            height: "auto",
            padding: "4px",
            margin: "4px",
            cursor: "pointer",
            ...(tags.has(tag)
              ? { color: "white", background: COLORS.ANTD_LINK_BLUE }
              : undefined),
          }}
          key={tag}
          onClick={() => {
            handleTagChange(tag, !tags.has(tag));
          }}
          color={tags.has(tag) ? undefined : tagColor}
        >
          {iconName && <Icon name={iconName} style={{ marginRight: "5px" }} />}
          {label}
        </Tag>
      );
      return description ? (
        <Tooltip title={description}>{tagElement}</Tooltip>
      ) : (
        tagElement
      );
    });
  }

  return (
    <div style={style}>
      <div style={{ textAlign: "center" }}>
        Select at least {smallIntegerToEnglishWord(minTags)}{" "}
        {plural(minTags, what)}
      </div>
      <div
        style={{
          marginTop: "5px",
          background: "white",
          borderRadius: "5px",
          padding: "10px",
        }}
      >
        {renderTags()}
      </div>
      {renderContact()}
    </div>
  );
}
