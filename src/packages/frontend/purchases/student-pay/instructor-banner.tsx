import { Button, Collapse } from "antd";
import type { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { useState } from "react";
import Cost from "./cost";
import { User } from "@cocalc/frontend/users";
import { redux } from "@cocalc/frontend/app-framework";
import type { CourseInfo } from "@cocalc/util/db-schema/projects";

interface Props {
  when: dayjs.Dayjs;
  paid: dayjs.Dayjs | null;
  purchaseInfo: PurchaseInfo;
  course: CourseInfo;
}

export default function PaySoon({ when, purchaseInfo, paid, course }: Props) {
  const [hide, setHide] = useState<boolean>(false);
  if (hide) {
    return null;
  }
  const user = course.account_id ? (
    <User account_id={course.account_id} />
  ) : (
    "Student"
  );

  return (
    <div>
      <Collapse>
        <Collapse.Panel
          key="it"
          header=<>
            Course Fee:{" "}
            {paid ? (
              <>
                {user} paid the course fee <Cost purchaseInfo={purchaseInfo} />
                {" -- "}
                <TimeAgo date={paid} />.
              </>
            ) : (
              <>
                {user} is required to pay the course fee{" "}
                <Cost purchaseInfo={purchaseInfo} /> to upgrade this project.
                Due: <TimeAgo date={when} />.
              </>
            )}
            <Button
              size="small"
              style={{ float: "right", fontSize: "9pt" }}
              onClick={() => setHide(true)}
            >
              <Icon name="times" /> Dismiss
            </Button>{" "}
          </>
        >
          {user} {paid ? "was" : "is"} required to pay a fee to upgrade this
          project. For more details see the Configuration tab of the course:{" "}
          <Button
            type="primary"
            onClick={() => {
              redux.getProjectActions(course.project_id).open_file({
                path: course.path,
                foreground: true,
                foreground_project: true,
              });
            }}
          >
            Open Course...
          </Button>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
//           <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
