/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input } from "antd";
import { useEffect, useState } from "react";
import { DebounceInput } from "react-debounce-input";
import { useIntl } from "react-intl";

import { CourseActions } from "../actions";
import type { HandoutRecord } from "../store";
import { CopyRunAllAlert } from "./copy-run-all";
import { filterPlaceholder, runAllAriaLabel } from "./course-unit-strings";
import type { HandoutStatus } from "./course-unit-types";
import { Progress } from "./progress";
import { RunAllPopover } from "./run-all-popover";
import { StudentAssignmentInfoHeader } from "./student-assignment-info-header";

interface HandoutHeaderProps {
  handout: HandoutRecord;
  status: HandoutStatus | null;
  numStudents: number;
  actions: CourseActions;
  studentSearch: string;
  setStudentSearch: (value: string) => void;
}

export function HandoutHeader({
  handout,
  status,
  numStudents,
  actions,
  studentSearch,
  setStudentSearch,
}: HandoutHeaderProps) {
  const intl = useIntl();
  const [openedRunAll, setOpenedRunAll] = useState<"distribution" | null>(null);

  useEffect(() => {
    setOpenedRunAll(null);
  }, [handout.get("handout_id")]);

  if (status == null) {
    return null;
  }
  // Keep a narrowed alias since nested closures use this value and TS can
  // lose the non-null guard on `status` across those closures.
  const handoutStatus = status;

  function renderDistributionRunAll() {
    return (
      <RunAllPopover
        id="distribution"
        open={openedRunAll === "distribution"}
        onOpenChange={(next) => setOpenedRunAll(next ? "distribution" : null)}
        type={handoutStatus.not_handout > 0 ? "primary" : "default"}
        content={
          <CopyRunAllAlert
            id="copy_confirm_handout"
            step="distribution"
            status={{
              done: handoutStatus.handout,
              not_done: handoutStatus.not_handout,
              total: numStudents,
            }}
            onRun={({ scope, overwrite }) => {
              // handout to all (non-deleted) students
              actions.handouts.copy_handout_to_all_students(
                handout.get("handout_id"),
                scope === "remaining",
                !!overwrite,
              );
              setOpenedRunAll(null);
            }}
          />
        }
        ariaLabel={runAllAriaLabel(intl, "distribution")}
      />
    );
  }

  return (
    <StudentAssignmentInfoHeader
      mode="handout"
      actions={{
        distribution: [renderDistributionRunAll()],
      }}
      progress={{
        distribution: (
          <Progress
            key="progress-handout"
            done={handoutStatus.handout}
            not_done={handoutStatus.not_handout}
            step="distributed"
          />
        ),
      }}
      filter={
        <DebounceInput
          debounceTimeout={500}
          element={Input as any}
          placeholder={filterPlaceholder(intl)}
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
      }
    />
  );
}
