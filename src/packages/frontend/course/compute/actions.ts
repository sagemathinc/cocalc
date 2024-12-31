import type { CourseActions } from "../actions";
import { cloneConfiguration } from "@cocalc/frontend/compute/clone";
import type { Unit } from "../store";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { ComputeServerConfig } from "../types";
import { merge } from "lodash";
import type { Command } from "./students";
import { getUnitId } from "./util";
import {
  computeServerAction,
  createServer,
  deleteServer,
} from "@cocalc/frontend/compute/api";

// const log = (..._args)=>{};
const log = console.log;

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

  setComputeServerConfig = ({
    unit_id,
    compute_server,
  }: {
    unit_id: string;
    compute_server: ComputeServerConfig;
  }) => {
    let { table, unit } = this.getUnit(unit_id);
    const obj = { ...unit.toJS(), table };
    obj.compute_server = merge(obj.compute_server, compute_server);
    this.course_actions.set(obj, true, true);
  };

  // Create and compute server associated to a given assignment or handout
  // for a specific student.  Does nothing if (1) the compute server already
  // exists, or (2) no compute server is configured for the given assignment.
  createComputeServer = reuseInFlight(
    async ({
      student_id,
      unit_id,
    }: {
      student_id: string;
      unit_id: string;
    }): Promise<number | undefined> => {
      // what compute server is configured for this assignment or handout?
      const { unit } = this.getUnit(unit_id);
      const compute_server = unit.get("compute_server");
      if (compute_server == null) {
        log("createComputeServer -- nothing to do - nothing configured.", {
          student_id,
        });
        return;
      }
      const id = compute_server.get("server_id");
      if (!id) {
        log("createComputeServer -- nothing to do - id not set.", {
          student_id,
        });
        return;
      }
      const cur_id = compute_server.getIn([
        "students",
        student_id,
        "server_id",
      ]);
      if (cur_id) {
        log("compute server already exists", { cur_id, student_id });
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
      const studentServer = {
        ...server,
        project_id: student_project_id,
      };
      // we must enable allowCollaboratorControl since it's needed for the
      // student to start/stop the compute server.
      studentServer.configuration.allowCollaboratorControl = true;
      const server_id = await createServer(studentServer);
      log("created new compute server", { studentServer, server_id });
      this.setComputeServerConfig({
        unit_id,
        compute_server: { students: { [student_id]: { server_id } } },
      });
      return server_id;
    },
  );

  computeServerCommand = async ({
    command,
    unit,
    student_id,
  }: {
    command: Command;
    unit: Unit;
    student_id: string;
  }) => {
    if (command == "create") {
      const unit_id = getUnitId(unit);
      await this.createComputeServer({ student_id, unit_id });
      return;
    }
    const id = unit.getIn([
      "compute_server",
      "students",
      student_id,
      "server_id",
    ]) as number | undefined;
    if (!id) {
      throw Error("compute server doesn't exist");
    }
    switch (command) {
      case "start":
      case "stop":
      case "deprovision":
        await computeServerAction({ id, action: command });
        return;
      case "delete":
        await deleteServer(id);
        const unit_id = getUnitId(unit);
        this.setComputeServerConfig({
          unit_id,
          compute_server: { students: { [student_id]: { server_id: 0 } } },
        });
        return;
      case "transfer":
      // todo
      default:
        throw Error(`command '${command}' not implemented`);
    }
  };
}
