/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import React from "react";
import { defineMessage, useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components/icon";

const messages = {
  buttonText: defineMessage({
    id: "frame-editors.llm.help-me-fix-button.button-text",
    defaultMessage:
      "{isHint, select, true {Give me a Hint...} other {Fix this Problem...}}",
    description:
      "Button text for help-me-fix functionality - hint vs complete solution",
  }),
};

interface HelpMeFixButtonProps {
  mode: "hint" | "solution";
  size?: any;
  style?: React.CSSProperties;
  onClick: () => void;
}

export default function HelpMeFixButton({
  mode,
  size,
  style,
  onClick,
}: HelpMeFixButtonProps) {
  const intl = useIntl();
  const isHint = mode === "hint";
  const buttonText = intl.formatMessage(messages.buttonText, { isHint });
  const buttonIcon = isHint ? "lightbulb" : "wrench";

  return (
    <Button size={size} style={style} onClick={onClick}>
      <Space>
        <Icon name={buttonIcon} />
        {buttonText}
      </Space>
    </Button>
  );
}
