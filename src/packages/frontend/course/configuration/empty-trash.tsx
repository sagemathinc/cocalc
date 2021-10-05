import { Card, Button } from "antd";
import { Icon } from "@cocalc/frontend/components";
import {
  useFrameContext,
  useMemo,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { CourseActions } from "../actions";
import { plural } from "@cocalc/util/misc";

export default function EmptyTrash() {
  const { actions } = useFrameContext();
  const courseActions = (actions as any).course_actions as CourseActions;
  const { name } = courseActions;
  const assignments = useRedux([name, "assignments"]);
  const students = useRedux([name, "students"]);
  const handouts = useRedux([name, "handouts"]);
  const num = useMemo(() => {
    const num = {
      assignments: 0,
      students: 0,
      handouts: 0,
      total: 0,
      desc: "Purge Deleted",
    };
    if (assignments) {
      for (const [, assignment] of assignments) {
        if (assignment.get("deleted")) {
          num.assignments += 1;
        }
      }
    }
    if (students) {
      for (const [, student] of students) {
        if (student.get("deleted")) {
          num.students += 1;
        }
      }
    }
    if (handouts) {
      for (const [, handout] of handouts) {
        if (handout.get("deleted")) {
          num.handouts += 1;
        }
      }
    }
    num.total = num.students + num.assignments + num.handouts;
    num.desc = `Purge ${num.students} deleted ${plural(
      num.students,
      "student"
    )}, ${num.assignments} ${plural(num.assignments, "assignment")}, and ${
      num.handouts
    } ${plural(num.handouts, "handout")}`;
    return num;
  }, [assignments, students, handouts]);

  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Empty Trash: {num.desc}
        </>
      }
    >
      {num.total == 0 ? (
        "You have no deleted students, assignments or handouts."
      ) : (
        <>
          When you delete students, assignments or handouts, they can be shown
          again by clicking "Show xx deleted students/assignments/handouts" in
          the corresponding tab of your course, then clicking undelete. You can
          purge these deleted students, assignments and handouts below.
          <div style={{ marginTop: "15px", textAlign: "center" }}>
            <Button
              onClick={() => {
                courseActions.configuration.purgeDeleted();
              }}
            >
              {num.desc}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
