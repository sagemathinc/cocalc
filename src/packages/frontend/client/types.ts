import { EventEmitter } from "events";

export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
  date?: Date; // remove the date when sending to the server
}

export type History = Message[];

export class ExecStream extends EventEmitter {
  job_id?: string;

  constructor() {
    super();
  }

  // Stream events:
  // - 'start' - streaming has begun
  // - 'job' - async job has been created, emits job info
  // - 'stdout' - new stdout content available
  // - 'stderr' - new stderr content available
  // - 'stats' - process statistics (CPU, memory usage)
  // - 'done' - execution completed, emits final status
  // - 'error' - an error occurred
  // - 'end' - stream ended
}
