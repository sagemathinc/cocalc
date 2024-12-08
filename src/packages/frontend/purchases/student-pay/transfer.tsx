/*
If the user is NOT a student in another course that they *have* paid the license for, then
this component shows nothing.

If the user is a student in at least one other course that they have paid for the license
for, then a "Transfer License..." button shows up.  When clicked, it shows a description
and buttons for each of the other courses that qualify.  Clicking on the button uses
a backend api call to actually transfer the license, which makes the current course be
paid for, but the other one is no longer paid for.

The motivation for this is that students switch sections in large classes, and this
minimizes friction.  Also, they pay for a license for the whole course, and getting a
prorated refund and making a new purchase isn't fair.

NOTE: the api call just allows for transfering and doesn't do much of a check, at least for
the first release. That's another way a malicious user could cheat.

NOTE: a concern is that this assumes the student has not been removed from the original
section. If that happens, they would have a license but no longer have the project,
which breaks the logic below.  There's always a problem no matter what you do...
*/

import { Button, Card, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { redux } from "@cocalc/frontend/app-framework";
import { getCost } from "./cost";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { studentPayTransfer } from "@cocalc/frontend/purchases/api";
import { len } from "@cocalc/util/misc";

interface Props {
  project_id: string;
}

export default function Transfer({ project_id }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const available = useMemo(() => {
    return getAvailable(project_id);
  }, []);

  if (available.length == 0) {
    return null;
  }

  const transferLicense = async (paid_project_id) => {
    console.log(
      "transfering license from ",
      paid_project_id,
      " to ",
      project_id,
    );
    try {
      setLoading(true);
      await studentPayTransfer({ project_id, paid_project_id });
      // success - restart projects so that they have the proper license setup.
      const actions = redux.getActions("projects");
      const store = redux.getStore("projects");
      for (const id of [project_id, paid_project_id]) {
        if (store.get_state(id) === "running") {
          actions.restart_project(id);
        }
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button disabled={loading} onClick={() => setOpen(true)}>
        <Icon name="sync" /> Transfer license from another course...
        {loading && <Spin />}
      </Button>
      {open && (
        <Card
          title={
            <>
              Transfer license from another course
              <Button
                style={{ float: "right", marginLeft: "30px" }}
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </>
          }
          style={{ maxWidth: "650px", margin: "30px auto" }}
        >
          You have paid for each of the comparable course projects listed below.
          Select one of them to transfer the license from that project to{" "}
          <ProjectTitle project_id={project_id} noClick />:
          <br />
          <br />
          {available.map((project_id) => (
            <Button
              key={project_id}
              disabled={loading}
              onClick={() => {
                transferLicense(project_id);
              }}
            >
              <ProjectTitle noClick project_id={project_id} />
            </Button>
          ))}
        </Card>
      )}
      <ShowError error={error} setError={setError} />
    </div>
  );
}

// returns project_id's of projects that are paid for and you can transfer the license
function getAvailable(project_id): string[] {
  // projects = data about all projects you collaborate on (and used recently -- this might leave off old projects, but that
  // should be fine for the purposes of transfering a license)
  const projects = redux.getStore("projects").get("project_map")?.toJS();
  if (projects == null) {
    return [];
  }
  // each project that is part of a course has a "course" field:
  //   pay = when it must be paid by
  //   paid = iso string of when they paid, if they actually paid
  //   payInfo = info about what they have to pay for, including start and end dates (as iso strings)
  //   cost = {cost:number, ...}
  // We allow transferring if:
  //   (1) start and end dates are within 7 days
  //   (2) cost is within $5.
  // At the end of the day we're just transferring a license and not actually giving away or taking anything, so there
  // is no danger of some really clever attacker creating fake classes and stealing money.  The worst case is just that
  // the student "cheats themselves" out of what the instructor recommends that they purchase for the best experience.

  const { course: targetCourse } = projects[project_id] ?? {};
  const targetStart = new Date(targetCourse.payInfo?.start ?? 0).valueOf();
  const targetEnd = new Date(targetCourse.payInfo?.end ?? 0).valueOf();
  const targetCost = getCost(targetCourse.payInfo);

  const available: string[] = [];
  if (targetCourse == null) {
    // this project isn't even part of a course.
    return available;
  }
  for (const id in projects) {
    if (id == project_id) {
      continue;
    }
    const { course, site_license } = projects[id] ?? {};
    if (course == null || site_license == null || len(site_license) == 0) {
      continue;
    }
    if (!course.paid) {
      continue;
    }
    // do the checks:
    const start = new Date(course.payInfo?.start ?? 0).valueOf();
    const end = new Date(course.payInfo?.end ?? 0).valueOf();
    const cost = getCost(course.payInfo);
    if (Math.abs(cost - targetCost) > 5) {
      continue;
    }
    if (Math.abs(start - targetStart) > 60 * 1000 * 24 * 7) {
      continue;
    }
    if (Math.abs(end - targetEnd) > 60 * 1000 * 24 * 7) {
      continue;
    }
    available.push(id);
  }

  return available;
}
