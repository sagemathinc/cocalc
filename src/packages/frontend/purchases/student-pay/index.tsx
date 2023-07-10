import { useMemo } from "react";
import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import PayNow from "./pay-now";
import PaySoon from "./pay-soon";
import InstructorBanner from "./instructor-banner";
import { DEFAULT_PURCHASE_INFO } from "@cocalc/frontend/course/configuration/student-pay";

export default function StudentPayUpgrade({ project_id }) {
  const course = useRedux(
    ["project_map", project_id, "course"],
    "projects"
  )?.toJS();
  const account_id = useTypedRedux("account", "account_id");

  const { when, purchaseInfo, student_account_id } = useMemo(() => {
    if (course == null) {
      return { when: null, purchaseInfo: null };
    }
    return {
      when: course.pay ? dayjs(course.pay) : null,
      purchaseInfo: (course.payInfo ?? DEFAULT_PURCHASE_INFO) as PurchaseInfo,
      student_account_id: course.account_id,
    };
  }, [course]);

  if (!when) {
    return null;
  }
  if (account_id == student_account_id) {
    if (when <= dayjs()) {
      return (
        <PayNow
          project_id={project_id}
          when={when}
          purchaseInfo={purchaseInfo}
        />
      );
    }
    return (
      <PaySoon
        project_id={project_id}
        when={when}
        purchaseInfo={purchaseInfo}
      />
    );
  } else {
    return (
      <InstructorBanner
        project_id={project_id}
        when={when}
        purchaseInfo={purchaseInfo}
      />
    );
  }
}
