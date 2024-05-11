import { task as purchaseTask } from "./purchases";
import { task as cloudTask } from "./cloud";
import { deletedTask } from "./clean/deleted-projects";

export const TASKS = [cloudTask, purchaseTask, deletedTask] as const;
