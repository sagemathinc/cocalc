/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Popconfirm } from "antd";
import { Icon } from "../../components";

export function DeleteAllStudents({ actions }) {
  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Delete all Students
        </>
      }
    >
      <Popconfirm
        title="All students will be deleted and upgrades removed from their projects."
        onConfirm={() => actions.students.deleteAllStudents()}
        okText={"YES, DELETE all Students"}
      >
        <Button danger>
          <Icon name="trash" /> Delete all Students...
        </Button>
      </Popconfirm>
      <hr />
      <span style={{ color: "#666" }}>
        Student projects will not be deleted. If you make a mistake, students
        can still be undeleted from the Student tab or using TimeTravel.
      </span>
    </Card>
  );
}
