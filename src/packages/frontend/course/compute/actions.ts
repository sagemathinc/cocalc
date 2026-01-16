import type { CourseActions } from "../actions";
import type { Unit } from "../store";
import type { ComputeServerConfig } from "../types";
import type { Command } from "./students";

const COMPUTE_SERVER_REMOVED_MESSAGE =
  "Compute servers have been removed from CoCalc.";

export class ComputeActions {
  constructor(course_actions: CourseActions) {
    void course_actions;
  }

  setComputeServerConfig = (_opts: {
    unit_id: string;
    compute_server: ComputeServerConfig;
  }) => {
    void _opts;
  };

  computeServerCommand = async (_opts: {
    command: Command;
    unit: Unit;
    student_id: string;
  }) => {
    void _opts;
    throw new Error(COMPUTE_SERVER_REMOVED_MESSAGE);
  };

  runTerminalCommand = async (_opts: {
    unit: Unit;
    student_ids: string[];
    setOutputs: (outputs: {
      stdout?: string;
      stderr?: string;
      exit_code?: number;
      student_id: string;
      total_time: number;
    }[]) => void;
    command: string;
    timeout?: number;
    err_on_exit?: boolean;
  }) => {
    void _opts;
    throw new Error(COMPUTE_SERVER_REMOVED_MESSAGE);
  };

  setComputeServerAssociations = async (_opts: {
    src_path: string;
    target_project_id: string;
    target_path: string;
    student_id: string;
    unit_id: string;
  }) => {
    void _opts;
  };
}
