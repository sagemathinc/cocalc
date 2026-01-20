import { Button, Space, Tag } from "antd";
import type { ReactNode } from "react";
import { Icon } from "@cocalc/frontend/components";
import { IconName, isIconName } from "@cocalc/frontend/components/icon";
import CopyButton from "@cocalc/frontend/components/copy-button";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { file_associations } from "@cocalc/frontend/file-associations";
import { filename_extension, trunc_middle } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const MARKDOWN_EXTS = [
  "tasks",
  "slides",
  "board",
  "chat",
  "sage-chat",
] as const;

function FindSnippet({
  ext,
  value,
  style,
  noWrap = false,
}: {
  ext: string;
  value: string;
  style?: React.CSSProperties;
  noWrap?: boolean;
}) {
  if (MARKDOWN_EXTS.includes(ext as any)) {
    return <StaticMarkdown value={value} style={style} />;
  }
  const mode = infoToMode(ext, { value });
  return (
    <CodeMirrorStatic
      no_border
      options={{ mode, lineWrapping: !noWrap }}
      value={value}
      style={style}
    />
  );
}

export function stripLineNumbers(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*\d+:\s?/);
      return match ? line.slice(match[0].length) : line;
    })
    .join("\n");
}

export function FindResultCard({
  title,
  subtitle,
  meta,
  snippet,
  snippetExt,
  snippetHeight = "4.5em",
  snippetNoWrap = false,
  titleNoWrap = false,
  titleClampLines,
  titleMinLines,
  metaMinLines,
  onClick,
  isSelected,
  actions,
  copyValue,
  icon,
  badge,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode[];
  snippet?: string;
  snippetExt?: string;
  snippetHeight?: string;
  snippetNoWrap?: boolean;
  titleNoWrap?: boolean;
  titleClampLines?: number;
  titleMinLines?: number;
  metaMinLines?: number;
  onClick?: (e: React.MouseEvent) => void | Promise<void>;
  isSelected?: boolean;
  actions?: ReactNode;
  copyValue?: string;
  icon?: string;
  badge?: string;
}) {
  const ext = snippetExt
    ? filename_extension(snippetExt) || snippetExt
    : filename_extension(title);
  const fallbackIcon: IconName = "file";
  const resolvedIcon = icon ?? file_associations[ext]?.icon;
  const iconName: IconName = isIconName(resolvedIcon)
    ? resolvedIcon
    : fallbackIcon;
  const showSnippet = Boolean(snippet?.trim());
  const snippetStyle: React.CSSProperties = {
    color: COLORS.GRAY_D,
    fontSize: "80%",
    lineHeight: "1.15",
    padding: "0 4px",
  };
  let titleStyle: React.CSSProperties = {
    wordBreak: "break-word",
    lineHeight: "1.2",
  };
  if (titleClampLines != null) {
    titleStyle = {
      ...titleStyle,
      display: "-webkit-box",
      WebkitLineClamp: titleClampLines,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    };
  } else if (titleNoWrap) {
    titleStyle = {
      flex: "1 1 auto",
      minWidth: 0,
      display: "block",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };
  }
  if (titleMinLines != null) {
    titleStyle = {
      ...titleStyle,
      minHeight: `${titleMinLines * 1.2}em`,
    };
  }
  return (
    <div
      role="button"
      style={{
        padding: "8px 10px",
        cursor: onClick ? "pointer" : "default",
        border: "1px solid #f0f0f0",
        borderRadius: "6px",
        background: isSelected ? "#e6f7ff" : "#fff",
      }}
      onClick={onClick}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
            <Icon
              name={iconName}
              style={{ flex: "0 0 auto", alignSelf: "flex-start", marginTop: "2px" }}
            />
            <strong style={titleStyle}>
              {trunc_middle(title || "(root)", 80)}
            </strong>
            {badge ? <Tag color="blue">{badge}</Tag> : null}
          </div>
          {subtitle ? (
            <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions || copyValue ? (
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ flex: "0 0 auto" }}
          >
            <Space size={6}>
              {actions}
              {copyValue ? (
                <CopyButton value={copyValue} noText size="small" />
              ) : null}
            </Space>
          </div>
        ) : null}
      </div>
      {meta || metaMinLines ? (
        <div
          style={{
            marginTop: "4px",
            fontSize: "12px",
            color: "#666",
            lineHeight: "1.2",
            minHeight:
              metaMinLines != null ? `${metaMinLines * 1.2}em` : undefined,
          }}
        >
          {(meta ?? []).map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
          {metaMinLines != null
            ? new Array(
                Math.max(0, metaMinLines - (meta?.length ?? 0)),
              )
                .fill(null)
                .map((_, idx) => (
                  <div key={`filler-${idx}`} style={{ visibility: "hidden" }}>
                    &nbsp;
                  </div>
                ))
            : null}
        </div>
      ) : null}
      {showSnippet ? (
        <div
          style={{
            marginTop: "6px",
            height: snippetHeight,
            overflow: "hidden",
          }}
        >
          <FindSnippet
            ext={ext}
            value={snippet ?? ""}
            style={snippetStyle}
            noWrap={snippetNoWrap}
          />
        </div>
      ) : null}
    </div>
  );
}

export function FindPrimaryAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      size="small"
      type="link"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </Button>
  );
}
