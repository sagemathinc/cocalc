import { task as purchaseTask } from "./purchases";
import { task as cloudTask } from "./cloud";

export const TASKS = [ cloudTask, purchaseTask ] as const;
