import { task as purchaseTask } from "./purchases";
import { task as cloudTask } from "./cloud";
import { task as storageTask } from "./cloud-filesystem";
import { deletedTask } from "./clean/deleted-projects";

export const TASKS = [
  cloudTask,
  purchaseTask,
  deletedTask,
  storageTask,
] as const;
