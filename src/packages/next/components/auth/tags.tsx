import { Checkbox, Col, Input, Row, Tag, Tooltip } from "antd";
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
import { CSS, Paragraph, Text } from "components/misc";

interface Props {
  tags: Set<string>;
  setTags: (tags: Set<string>) => void;
  signupReason: string;
  setSignupReason: (reason: string) => void;
  minTags: number;
  what: string;
  style?: CSS;
  warning?: boolean;
  contact?: boolean; // if true, add checkbox to be "contacted" below, which adds a "contact" tag
}

export default function Tags({
  tags,
  setTags,
  signupReason,
  setSignupReason,
  minTags,
  style,
  what,
  warning = false,
  contact = false,
}: Props) {
  const handleTagChange = (tag: string, checked: boolean) => {
    if (checked) {
      tags.add(tag);
    } else {
      tags.delete(tag);
    }
    setTags(new Set(tags));
    try {
      localStorage.sign_up_tags = JSON.stringify(Array.from(tags));
    } catch (_) {}
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
          <Paragraph>
            <Text strong>Interested in a personal introduction to CoCalc?</Text>
            <br />
            We promise no spam or obligations.
          </Paragraph>
        </Checkbox>
        {checked ? (
          <Input
            addonBefore="Your Goal:"
            placeholder="How do you plan to use CoCalc?"
            style={{ width: "100%" }}
            value={signupReason}
            // status={!signupReason.trim() ? "error" : undefined} // for now, this is optional
            onChange={(e) => {
              setSignupReason(e.target.value);
              try {
                localStorage.sign_up_usage_intent = e.target.value;
              } catch (_) {}
            }}
          />
        ) : undefined}
      </>
    );
  }

  function renderTags() {
    return TAGS.map(({ label, tag, icon, color, description }, idx) => {
      const tagColor =
        color ?? getRandomColor(tag, { min: 200, max: 250, diff: 20, seed: 5 });
      const iconName = icon ?? file_associations[tag]?.icon;
      const isChecked = tags.has(tag);
      const tagElement = (
        <Col md={12} key={tag}>
          <Tag
            key={tag}
            style={{
              fontSize: "14px",
              height: "auto",
              padding: "4px",
              margin: "4px",
              width: "100%",
              cursor: "pointer",
              ...(isChecked
                ? { color: "white", background: COLORS.ANTD_LINK_BLUE }
                : { color: "black" }),
            }}
            onClick={() => {
              handleTagChange(tag, !isChecked);
            }}
            color={isChecked ? undefined : tagColor}
          >
            {iconName ? (
              <Icon name={iconName} style={{ marginRight: "5px" }} />
            ) : undefined}
            {label}
            {isChecked ? (
              <Icon
                name="check"
                style={{ marginRight: "5px", float: "right" }}
              />
            ) : undefined}
          </Tag>
        </Col>
      );
      return description ? (
        <Tooltip
          title={description}
          placement={idx % 2 === 0 ? "left" : "right"}
        >
          {tagElement}
        </Tooltip>
      ) : (
        tagElement
      );
    });
  }

  const warningStyle = {
    border: `1px solid ${warning ? COLORS.ANTD_RED_WARN : "transparent"}`,
  } as const;

  return (
    <div style={style}>
      <div style={{ textAlign: "center" }}>
        {minTags > 0 ? (
          <>
            Select at least {smallIntegerToEnglishWord(minTags)}{" "}
            {plural(minTags, what)}:
          </>
        ) : (
          <>Select your {what}:</>
        )}
      </div>
      <Row
        gutter={[10, 10]}
        style={{
          marginTop: "5px",
          background: "white",
          borderRadius: "5px",
          padding: "10px",
          ...warningStyle,
        }}
      >
        {renderTags()}
      </Row>
      {renderContact()}
    </div>
  );
}
