import type { CourseActions } from "../actions";
import { createServer } from "@cocalc/frontend/compute/api";
import { cloneConfiguration } from "@cocalc/frontend/compute/clone";
import type { Unit } from "../store";

export class ComputeActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private getStore = () => {
    const store = this.course_actions.get_store();
    if (store == null) {
      throw Error("no store");
    }
    return store;
  };

  private getUnit = (
    unit_id: string,
  ): {
    unit: Unit;
    table: "assignments" | "handouts";
  } => {
    // this code below is reasonable since the id is a random uuidv4, so no
    // overlap between assignments and handouts in practice.
    const store = this.getStore();
    const assignment = store.get_assignment(unit_id);
    if (assignment != null) {
      return { unit: assignment as unknown as Unit, table: "assignments" };
    }
    const handout = store.get_handout(unit_id);
    if (handout != null) {
      return { unit: handout as unknown as Unit, table: "handouts" };
    }
    throw Error(`no assignment or handout with id '${unit_id}'`);
  };

  // Create and compute server associated to a given assignment or handout
  // for a specific student.  Does nothing if (1) the compute server already
  // exists, or (2) no compute server is configured for the given assignment.
  createComputeServer = async ({
    student_id,
    unit_id,
  }: {
    student_id: string;
    unit_id: string;
  }): Promise<number | undefined> => {
    // what compute server is configured for this assignment or handout?
    const { unit, table } = this.getUnit(unit_id);
    const compute_server = unit.get("compute_server");
    if (compute_server == null) {
      // nothing to do - nothing configured.
      return;
    }
    const id = compute_server.get("server_id");
    if (!id) {
      return;
    }
    const cur_id = compute_server.getIn(["students", student_id, "server_id"]);
    if (cur_id) {
      // compute server already exists
      return cur_id;
    }
    const store = this.getStore();
    const project_id = store.get("course_project_id");
    const server = await cloneConfiguration({
      id,
      project_id,
      noChange: true,
    });
    const student_project_id = store.get_student_project_id(student_id);
    const server_id = await createServer({
      ...server,
      project_id: student_project_id,
    });
    this.course_actions.set({
      table,
      compute_server: { students: { [student_id]: { server_id } } },
    });
    return server_id;
  };
}
