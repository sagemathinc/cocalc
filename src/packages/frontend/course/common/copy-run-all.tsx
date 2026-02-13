/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space } from "antd";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import type { AssignmentCopyStep, CopyStep } from "../types";
import {
  copyConfirmAllCaution,
  handoutCopyConfirmAllCaution,
} from "./course-unit-strings";
import {
  allStudents,
  commonMsgs,
  remainingStudents,
  runAllIntro,
} from "./copy-run-all-messages";

interface CopyRunAllAlertProps {
  id: string;
  step: CopyStep;
  status: { done: number; not_done: number; total: number };
  onRun: (opts: { scope: "remaining" | "all"; overwrite?: boolean }) => void;
  hasStudentSubdir?: boolean;
}

export function CopyRunAllAlert({
  id,
  step,
  status,
  onRun,
  hasStudentSubdir = false,
}: CopyRunAllAlertProps) {
  const intl = useIntl();
  const overwriteToken = "OVERWRITE";
  const [confirmAll, setConfirmAll] = useState<boolean>(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<boolean>(false);
  const [confirmOverwriteText, setConfirmOverwriteText] = useState<string>("");

  useEffect(() => {
    setConfirmAll(false);
    setConfirmOverwrite(false);
    setConfirmOverwriteText("");
  }, [id, status.done, status.not_done, status.total]);

  const { done, not_done, total } = status;
  const cautionContent =
    step === "distribution"
      ? handoutCopyConfirmAllCaution(intl)
      : copyConfirmAllCaution(intl, step as AssignmentCopyStep);
  const allowOverwrite = step === "assignment" || step === "distribution";
  const possible = done + not_done;
  const showNewButton = not_done > 0 && !confirmAll;
  const alertType = confirmAll
    ? "error"
    : showNewButton
      ? "warning"
      : "success";
  const msg = commonMsgs(intl, overwriteToken);

  function render_confirm_overwrite() {
    if (!confirmOverwrite) return null;
    return (
      <Space direction="vertical">
        {msg.typeOverwrite}
        <Input
          autoFocus
          onChange={(e) => setConfirmOverwriteText((e.target as any).value)}
        />
        <Button
          disabled={confirmOverwriteText !== overwriteToken}
          icon={<Icon name="exclamation-triangle" />}
          danger
          type="primary"
          onClick={() => {
            onRun({ scope: "all", overwrite: true });
            setConfirmOverwrite(false);
            setConfirmOverwriteText("");
          }}
        >
          {msg.confirmWithoutBackup}
        </Button>
      </Space>
    );
  }

  function render_confirm_all() {
    return (
      <Space direction="vertical" key="confirm-all">
        {cautionContent}
        <Space>
          <Button
            key="all"
            type="primary"
            disabled={confirmOverwrite}
            onClick={() => onRun({ scope: "all" })}
          >
            {msg.withBackup}
          </Button>
          {allowOverwrite ? (
            <Button
              key="all-overwrite"
              danger
              onClick={() => setConfirmOverwrite(true)}
              disabled={confirmOverwrite}
            >
              {msg.withoutBackup}
            </Button>
          ) : undefined}
          <Button
            key="back"
            onClick={() => {
              setConfirmAll(false);
              setConfirmOverwrite(false);
            }}
          >
            {msg.back}
          </Button>
        </Space>
        {render_confirm_overwrite()}
      </Space>
    );
  }

  const message = (
    <Space
      direction="vertical"
      style={{ display: "inline-flex", alignItems: "stretch" }}
    >
      {step === "assignment" && hasStudentSubdir ? (
        <Alert
          type="info"
          message={
            <span>
              {msg.studentSubdirInfo}{" "}
              <a
                rel="noopener noreferrer"
                target="_blank"
                href="https://doc.cocalc.com/teaching-nbgrader.html#student-version"
              >
                {msg.nbgraderDocs}
              </a>
            </span>
          }
        />
      ) : null}
      <div>{runAllIntro(intl, step)}</div>
      {showNewButton ? (
        <Button
          key="new"
          type="primary"
          onClick={() => onRun({ scope: "remaining" })}
        >
          {not_done === total ? (
            <>{allStudents(intl, step, total)}</>
          ) : (
            <>{remainingStudents(intl, step, not_done)}</>
          )}
        </Button>
      ) : undefined}
      {not_done !== possible ? (
        <Button
          key="all"
          danger
          disabled={confirmAll}
          onClick={() => setConfirmAll(true)}
        >
          {allStudents(intl, step, possible)}...
        </Button>
      ) : undefined}
      {confirmAll ? render_confirm_all() : undefined}
    </Space>
  );

  return <Alert key={id} type={alertType} message={message} />;
}
