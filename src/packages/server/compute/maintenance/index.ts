import { task as purchaseTask } from "./purchases";
import { task as cloudTask } from "./cloud";
import { tasks as storageTasks } from "./cloud-filesystem";
import { deletedTask } from "./clean/deleted-projects";

export const TASKS = [
  cloudTask,
  purchaseTask,
  deletedTask,
  ...storageTasks,
] as const;
