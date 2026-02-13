/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space, Spin } from "antd";
import type { SizeType } from "antd/lib/config-provider/SizeContext";
import type { TooltipPlacement } from "antd/lib/tooltip";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon, Tip } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { COPY_TIMEOUT_MS } from "@cocalc/frontend/course/consts";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { BigTime } from "./big-time";
import type { LastCopyInfo } from "../store";

interface CopyStepStatusProps {
  stepLabel: string;
  activityLabel: string;
  data: LastCopyInfo | undefined;
  enableCopy: boolean;
  tips: {
    copy: string;
    open: string;
  };
  handlers: {
    open: () => void;
    copy: () => void;
    stop: () => void;
  };
  recopy: boolean;
  setRecopy: (value: boolean) => void;
  omitErrors?: boolean;
  placement: TooltipPlacement;
  size: SizeType;
  copyingLabel: string;
  openTitle?: string;
  openAriaLabel?: string;
  showWhatHappensLink?: boolean;
  errorContext?: string;
}

export function CopyStepStatus({
  stepLabel,
  activityLabel,
  data,
  enableCopy,
  tips,
  handlers,
  recopy,
  setRecopy,
  omitErrors = false,
  placement,
  size,
  copyingLabel,
  openTitle = "Open assignment",
  openAriaLabel = "Open assignment folder",
  showWhatHappensLink = false,
  errorContext = "assignment",
}: CopyStepStatusProps): React.JSX.Element {
  const intl = useIntl();
  const info = data ?? {};
  const v: React.JSX.Element[] = [];

  function render_last_time(time: string | number | Date) {
    return (
      <Space key="time" wrap>
        <BigTime date={time} />
      </Space>
    );
  }

  function render_error(error) {
    if (typeof error !== "string") {
      error = `${error}`;
    }
    if (error.includes("[object Object]")) {
      // already too late to know the actual error -- it got mangled/reported incorrectly
      error = "";
    }
    // We search for two different error messages, since different errors happen in
    // KuCalc versus other places cocalc runs.  It depends on what is doing the copy.
    if (
      error.indexOf("No such file or directory") !== -1 ||
      error.indexOf("ENOENT") != -1
    ) {
      error = `The student might have renamed or deleted the directory that contained their ${errorContext}.  Open their project and see what happened.   If they renamed it, you could rename it back, then collect the ${errorContext} again -- \n${error}`;
    } else {
      error = `Try to ${stepLabel.toLowerCase()} again -- \n${error}`;
    }
    return (
      <ShowError
        key="error"
        error={error}
        style={{ padding: "4px 4px", overflowWrap: "anywhere" }}
      />
    );
  }

  function render_open() {
    return (
      <Tip key="open" title={openTitle} tip={tips.open} placement={placement}>
        <Button
          onClick={handlers.open}
          size={size}
          icon={<Icon name="folder-open" />}
          aria-label={openAriaLabel}
        />
      </Tip>
    );
  }

  function render_copy() {
    return (
      <Tip key="copy" title={stepLabel} tip={tips.copy} placement={placement}>
        <Button
          onClick={handlers.copy}
          size={size}
          icon={<Icon name="caret-right" />}
          aria-label={`${stepLabel} this student`}
        />
      </Tip>
    );
  }

  function render_copying() {
    return [
      <Button key="stop" danger onClick={handlers.stop} size={size}>
        {intl.formatMessage(labels.cancel)}
      </Button>,
      <Button key="copy" disabled={true} size={size}>
        <Spin /> {copyingLabel ?? stepLabel}
      </Button>,
    ];
  }

  function render_recopy_confirm() {
    if (recopy) {
      const v: React.JSX.Element[] = [];
      v.push(
        <Tip
          key="copy_cancel"
          title={intl.formatMessage(labels.cancel)}
          tip={intl.formatMessage(labels.cancel)}
        >
          <Button size={size} onClick={() => setRecopy(false)}>
            {intl.formatMessage(labels.cancel)}
          </Button>
        </Tip>,
      );
      v.push(
        <Tip
          key="recopy_confirm"
          title={stepLabel}
          placement={placement}
          tip={tips.copy}
        >
          <Button
            danger
            size={size}
            onClick={() => {
              setRecopy(false);
              handlers.copy();
            }}
          >
            <FormattedMessage
              id="course.student-assignment-info.recopy_confirm.label"
              defaultMessage={`Yes, {activity} again`}
              description={"Confirm an activity, like 'assign', 'collect', ..."}
              values={{ activity: activityLabel.toLowerCase() }}
            />
          </Button>
        </Tip>,
      );
      if (showWhatHappensLink) {
        v.push(
          <div key="what-happens">
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://doc.cocalc.com/teaching-tips_and_tricks.html#how-exactly-are-assignments-copied-to-students"
            >
              {intl.formatMessage({
                id: "course.student-assignment-info.recopy.what_happens",
                defaultMessage: "What happens when I assign again?",
                description:
                  "Asking the question, what happens if all files are transferred to all students in an online course once again.",
              })}
            </a>
          </div>,
        );
      }
      return v;
    }
    return [
      <Tip
        key="copy"
        title={stepLabel}
        placement={placement}
        tip={tips.copy}
      >
        <Button
          size={size}
          icon={<Icon name="redo" />}
          onClick={() => setRecopy(true)}
          aria-label={`Redo ${stepLabel.toLowerCase()} for this student`}
        />
      </Tip>,
    ];
  }

  if (enableCopy) {
    const now = webapp_client.server_time();
    const in_progress = info.start != null && now - info.start < COPY_TIMEOUT_MS;
    if (in_progress) {
      v.push(...render_copying());
      v.push(render_open());
    } else if (info.time) {
      v.push(render_open());
      v.push(...render_recopy_confirm());
    } else {
      v.push(render_copy());
    }
  }

  if (info.time) {
    v.push(render_last_time(info.time));
  }
  if (info.error && !omitErrors) {
    v.push(render_error(info.error));
  }

  return <Space wrap>{v}</Space>;
}
