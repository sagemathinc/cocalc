/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "../../components";
import { Button, Card, Popconfirm } from "antd";

interface Props {
  deleteAllStudentProjects: () => void;
}

export function DeleteAllStudentProjects({ deleteAllStudentProjects }: Props) {
  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Delete all Student Projects
        </>
      }
    >
      <Popconfirm
        title="Delete all student projects and remove students from them?"
        description={
          <div style={{ maxWidth: "400px" }}>
            You will still temporarily have access to the deleted projects in
            the Projects page (select "Deleted and Hidden"), but students will
            be removed from the deleted projects immediately.
          </div>
        }
        onConfirm={deleteAllStudentProjects}
        okText={"YES, DELETE all Student Projects"}
      >
        <Button danger>
          <Icon name="trash" /> Delete all Student Projects...
        </Button>
      </Popconfirm>
      <hr />
      <span style={{ color: "#666" }}>
        If for some reason you would like to delete all the student projects
        created for this course, you may do so by clicking above. Be careful!
        Students will be removed from the deleted projects.
      </span>
    </Card>
  );
}
