/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Col, Popconfirm, Row, Space } from "antd";
import { MouseEvent, ReactNode } from "react";
import { useIntl } from "react-intl";

import { DateTimePicker, Icon, Tip } from "@cocalc/frontend/components";
import { trunc_middle } from "@cocalc/util/misc";

import { CourseActions } from "../actions";
import { ConfigurePeerGrading } from "../assignments/configure-peer";
import { ComputeServerButton } from "../compute";
import type { AssignmentRecord, HandoutRecord, Unit } from "../store";
import { useButtonSize } from "../util";
import {
  deleteLabel,
  dueDateMessages,
  exportCollectedMessages,
  fileActivityMessages,
  deleteConfirmMessages,
  openFolderMessages,
  peerGradingMessages,
  undeleteMessages,
} from "./course-unit-strings";
import type { UnitLabel } from "./course-unit-strings";
import { isAssignmentUnit } from "./course-unit-types";

interface CourseUnitControlsCommonProps {
  actions: CourseActions;
  onOpenUnitPath: (e?: MouseEvent<HTMLElement>) => void;
}

interface CourseUnitControlsAssignmentProps
  extends CourseUnitControlsCommonProps {
  unit: AssignmentRecord;
  expandPeerConfig?: boolean;
  showPeerDisabledAlert: boolean;
  setShowPeerDisabledAlert: (value: boolean) => void;
}

interface CourseUnitControlsHandoutProps extends CourseUnitControlsCommonProps {
  unit: HandoutRecord;
}

type CourseUnitControlsProps =
  | CourseUnitControlsAssignmentProps
  | CourseUnitControlsHandoutProps;

export function CourseUnitControls(props: CourseUnitControlsProps) {
  const intl = useIntl();
  const size = useButtonSize();

  const { actions, onOpenUnitPath } = props;
  let renderDue: () => ReactNode = () => null;
  let renderPeerButton: () => ReactNode = () => null;
  let renderPeerExtras: () => ReactNode = () => null;
  let renderExportAssignment: () => ReactNode = () => null;
  let unitLabel: UnitLabel;
  let unitId: string;
  let unitPath: string;
  let unitDeleted: boolean;
  let deleteUnit: () => void;
  let undeleteUnit: () => void;

  function renderOpenButton() {
    const { label, title, tip } = openFolderMessages(intl, unitLabel);
    return (
      <Tip title={title} tip={tip}>
        <Button onClick={onOpenUnitPath} icon={<Icon name="folder-open" />}>
          {label}
        </Button>
      </Tip>
    );
  }

  function renderExportFileUseTimes() {
    const { label, title, tip } = fileActivityMessages(intl, unitLabel);
    return (
      <Tip title={title} tip={tip}>
        <Button
          onClick={() => actions.export.file_use_times(unitId)}
          icon={<Icon name="clock" />}
        >
          {label}
        </Button>
      </Tip>
    );
  }

  function renderDeleteButton() {
    if (unitDeleted) {
      const { label, title, tip } = undeleteMessages(intl, unitLabel);
      return (
        <Tip placement="left" title={title} tip={tip}>
          <Button onClick={undeleteUnit} icon={<Icon name="undo" />}>
            {label}
          </Button>
        </Tip>
      );
    } else {
      const { title, body } = deleteConfirmMessages(
        intl,
        unitLabel,
        trunc_middle(unitPath, 24),
      );
      return (
        <Popconfirm
          onConfirm={deleteUnit}
          title={
            <div style={{ maxWidth: "400px" }}>
              <b>{title}</b>
              <br />
              {body}
            </div>
          }
        >
          <Button icon={<Icon name="trash" />}>{deleteLabel(intl)}</Button>
        </Popconfirm>
      );
    }
  }

  if (isAssignmentUnit(props.unit)) {
    const {
      unit,
      expandPeerConfig,
      showPeerDisabledAlert,
      setShowPeerDisabledAlert,
    } = props as CourseUnitControlsAssignmentProps;
    const peerMsg = peerGradingMessages(intl);
    unitLabel = "assignment";
    unitId = unit.get("assignment_id") ?? "";
    unitPath = unit.get("path");
    unitDeleted = unit.get("deleted");
    deleteUnit = () => actions.assignments.delete_assignment(unitId);
    undeleteUnit = () => actions.assignments.undelete_assignment(unitId);

    renderDue = () => {
      const { label, title, tip } = dueDateMessages(intl);
      return (
        <Tip title={title} tip={tip}>
          <span>
            {label}{" "}
            <DateTimePicker
              value={unit.get("due_date")}
              onChange={(value) => {
                const due: Date | string | null | undefined =
                  value && typeof (value as any).toDate === "function"
                    ? (value as any).toDate()
                    : value;
                actions.assignments.set_due_date(unitId, due);
              }}
            />
          </span>
        </Tip>
      );
    };

    renderPeerButton = () => {
      const nbgraderUsed = !!unit.get("nbgrader");
      const button = (
        <Button
          disabled={expandPeerConfig || nbgraderUsed}
          onClick={() => actions.toggle_item_expansion("peer_config", unitId)}
          icon={
            <Icon
              name={
                unit.getIn(["peer_grade", "enabled"])
                  ? "check-square-o"
                  : "square-o"
              }
            />
          }
        >
          {peerMsg.label}
        </Button>
      );
      if (nbgraderUsed) {
        return (
          <Tip title={peerMsg.disabledTooltip}>
            <span>{button}</span>
          </Tip>
        );
      } else {
        return button;
      }
    };

    renderExportAssignment = () => {
      const { label, title, tip } = exportCollectedMessages(intl);
      return (
        <Tip title={title} tip={tip}>
          <Button
            onClick={() => actions.assignments.export_collected(unitId)}
            icon={<Icon name="cloud-download" />}
          >
            {label}
          </Button>
        </Tip>
      );
    };

    renderPeerExtras = () => (
      <>
        {showPeerDisabledAlert ? (
          <div style={{ marginTop: 8 }}>
            <Alert
              type="warning"
              showIcon
              closable
              onClose={() => setShowPeerDisabledAlert(false)}
              message={peerMsg.disabledAlert}
            />
          </div>
        ) : null}
        {expandPeerConfig ? (
          <ConfigurePeerGrading actions={actions} assignment={unit} />
        ) : null}
      </>
    );
  } else {
    const { unit } = props as CourseUnitControlsHandoutProps;
    unitLabel = "handout";
    unitId = unit.get("handout_id");
    unitPath = unit.get("path");
    unitDeleted = unit.get("deleted");
    deleteUnit = () => actions.handouts.delete_handout(unitId);
    undeleteUnit = () => actions.handouts.undelete_handout(unitId);
  }
  return (
    <Space
      key="controls-stack"
      direction="vertical"
      size={size === "small" ? "small" : "middle"}
      style={{ width: "100%" }}
    >
      <Row gutter={[8, 4]} align="top" justify="space-between">
        <Col md={16}>
          <Space wrap>
            {renderOpenButton()}
            {renderDue()}
            {renderPeerButton()}
            <ComputeServerButton
              key="compute"
              actions={actions}
              unit={props.unit as unknown as Unit}
            />
          </Space>
        </Col>
        <Col md={8} style={{ marginLeft: "auto" }}>
          <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
            {renderExportFileUseTimes()}
            {renderExportAssignment()}
            {renderDeleteButton()}
          </Space>
        </Col>
      </Row>
      {renderPeerExtras()}
    </Space>
  );
}
