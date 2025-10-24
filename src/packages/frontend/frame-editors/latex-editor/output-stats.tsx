/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { defineMessage, useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

import { WORD_COUNT_ICON } from "./constants";
import { OUTPUT_HEADER_STYLE } from "./util";

export const STATISTICS_HEADER = defineMessage({
  id: "latex.output.stats.header",
  defaultMessage: "Statistics",
  description: "Header text for the statistics section in LaTeX output",
});

interface OutputStatsProps {
  wordCountLoading: boolean;
  wordCount: string;
  refreshWordCount: (force?: boolean) => void;
  uiFontSize: number;
  path?: string;
}

export function OutputStats({
  wordCountLoading,
  wordCount,
  refreshWordCount,
  uiFontSize,
  path = "",
}: OutputStatsProps) {
  const intl = useIntl();

  return (
    <div
      className="smc-vfill"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
      role="region"
      aria-label={`Stats: ${path}`}
    >
      {/* Fixed header with refresh button */}
      <div style={OUTPUT_HEADER_STYLE}>
        <span
          style={{
            color: COLORS.GRAY_M,
            fontSize: uiFontSize,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <Icon name={WORD_COUNT_ICON} />
          {intl.formatMessage(STATISTICS_HEADER)}
        </span>

        <Button
          size="small"
          icon={<Icon name="refresh" />}
          onClick={() => refreshWordCount(true)}
          loading={wordCountLoading}
          disabled={wordCountLoading}
        >
          {intl.formatMessage(labels.refresh)}
        </Button>
      </div>

      {/* Scrollable statistics content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px",
        }}
      >
        <pre
          style={{
            fontSize: `${uiFontSize - 2}px`,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            margin: 0,
            color: COLORS.GRAY_D,
          }}
        >
          {wordCount || "Click refresh to generate word count statistics..."}
        </pre>
      </div>
    </div>
  );
}
