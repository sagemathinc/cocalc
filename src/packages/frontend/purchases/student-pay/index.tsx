import { useMemo, useState } from "react";
import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import PayNow from "./pay-now";
import PaySoon from "./pay-soon";
import InstructorBanner from "./instructor-banner";
import { DEFAULT_PURCHASE_INFO } from "@cocalc/util/licenses/purchase/student-pay";

export default function StudentPayUpgrade({ project_id }) {
  const [open, setOpen] = useState<boolean>(false);
  const course = useRedux(
    ["project_map", project_id, "course"],
    "projects"
  )?.toJS();
  const account_id = useTypedRedux("account", "account_id");

  const { when, paid, purchaseInfo, student_account_id } = useMemo(() => {
    if (course == null) {
      return { when: null, purchaseInfo: null, paid: null };
    }
    return {
      when: course.pay ? dayjs(course.pay) : null,
      paid: course.paid ? dayjs(course.paid) : null,
      purchaseInfo: (course.payInfo ?? DEFAULT_PURCHASE_INFO) as PurchaseInfo,
      student_account_id: course.account_id,
    };
  }, [course]);

  if (!when) {
    return null;
  }
  if (account_id == student_account_id) {
    if (paid) {
      return null;
    }
    if (when <= dayjs()) {
      return (
        <PayNow
          project_id={project_id}
          when={when}
          purchaseInfo={purchaseInfo}
          open={true}
        />
      );
    }
    return (
      <>
        <PaySoon when={when} purchaseInfo={purchaseInfo} setOpen={setOpen} />
        <PayNow
          open={open}
          setOpen={setOpen}
          project_id={project_id}
          when={when}
          purchaseInfo={purchaseInfo}
        />
      </>
    );
  } else {
    return (
      <InstructorBanner
        when={when}
        purchaseInfo={purchaseInfo}
        paid={paid}
        course={course}
      />
    );
  }
}
