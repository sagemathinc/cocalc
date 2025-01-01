import type { CourseActions } from "../actions";
import { cloneConfiguration } from "@cocalc/frontend/compute/clone";
import type { Unit } from "../store";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { ComputeServerConfig } from "../types";
import { merge } from "lodash";
import type { Command } from "./students";
import { getUnitId, MAX_PARALLEL_TASKS } from "./util";
import {
  computeServerAction,
  createServer,
  deleteServer,
  getServersById,
} from "@cocalc/frontend/compute/api";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { map as awaitMap } from "awaiting";

declare var DEBUG: boolean;

// const log = (..._args)=>{};
const log = DEBUG ? console.log : (..._args) => {};

export class ComputeActions {
  private course_actions: CourseActions;
  private debugComputeServer?: {
    project_id: string;
    compute_server_id: number;
  };

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
      this.setComputeServerConfig({
        unit_id,
        compute_server: { students: { [student_id]: { server_id } } },
      });
      return server_id;
    },
  );

  // returns GLOBAL id of compute server for the given unit, or undefined if one isn't configured.
  getComputeServerId = ({ unit, student_id }): number | undefined => {
    return unit.getIn([
      "compute_server",
      "students",
      student_id,
      "server_id",
    ]) as number | undefined;
  };

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
    const id = this.getComputeServerId({ unit, student_id });
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

  private getDebugComputeServer = reuseInFlight(async () => {
    if (this.debugComputeServer == null) {
      const compute_server_id = 1;
      const project_id = (
        await getServersById({
          ids: [compute_server_id],
          fields: ["project_id"],
        })
      )[0].project_id as string;
      this.debugComputeServer = { compute_server_id, project_id };
    }
    return this.debugComputeServer;
  });

  private runTerminalCommandOneStudent = async ({
    unit,
    student_id,
    ...terminalOptions
  }) => {
    const store = this.getStore();
    let project_id = store.get_student_project_id(student_id);
    if (!project_id) {
      throw Error("student project doesn't exist");
    }
    let compute_server_id = this.getComputeServerId({ unit, student_id });
    if (!compute_server_id) {
      throw Error("compute server doesn't exist");
    }
    if (DEBUG) {
      log(
        "runTerminalCommandOneStudent: in DEBUG mode, so actually using debug compute server",
      );
      ({ compute_server_id, project_id } = await this.getDebugComputeServer());
    }

    return await webapp_client.project_client.exec({
      ...terminalOptions,
      project_id,
      compute_server_id,
    });
  };

  // Run a terminal command in parallel on the compute servers of the given students.
  // This does not throw an exception on error; instead, some entries in the output
  // will have nonzero exit_code.
  runTerminalCommand = async ({
    unit,
    student_ids,
    setOutputs,
    ...terminalOptions
  }) => {
    let outputs: {
      stdout?: string;
      stderr?: string;
      exit_code?: number;
      student_id: string;
      total_time: number;
    }[] = [];
    const timeout = terminalOptions.timeout;
    const start = Date.now();
    const task = async (student_id) => {
      let result;
      try {
        result = {
          ...(await this.runTerminalCommandOneStudent({
            unit,
            student_id,
            ...terminalOptions,
            err_on_exit: false,
          })),
          student_id,
          total_time: (Date.now() - start) / 1000,
        };
      } catch (err) {
        result = {
          student_id,
          stdout: "",
          stderr: `${err}`,
          exit_code: -1,
          total_time: (Date.now() - start) / 1000,
          timeout,
        };
      }
      outputs = [...outputs, result];
      setOutputs(outputs);
    };
    await awaitMap(student_ids, MAX_PARALLEL_TASKS, task);
    return outputs;
  };
}
