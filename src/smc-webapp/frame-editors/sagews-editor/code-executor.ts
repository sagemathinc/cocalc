import { EventEmitter } from "events";

interface ExecutionRequest {
  path: string;
  code: string;
  data?: object;
  cell_id?: string;
  preparse?: boolean;
}

type States = "init" | "running" | "interrupted" | "done" | "closed";

export interface CodeExecutor {
  start(): Promise<void>;
  interrupt(): Promise<void>;
  close(): void;
}

const MOCK = true;

export function code_executor(req: ExecutionRequest): CodeExecutor {
  if (MOCK) {
    return new CodeExecutorMock(req);
  } else {
    return new CodeExecutorProject(req);
  }
}

/*
Emits:
  - 'output', mesg -- as each output message arrives
  - 'state', state -- for each state change
*/

abstract class CodeExecutorAbstract extends EventEmitter
  implements CodeExecutor {
  protected state: States = "init";
  protected request: ExecutionRequest;

  constructor(request: ExecutionRequest) {
    super();
    this.request = request;
  }

  protected _set_state(state: States): void {
    this.state = state;
    this.emit("state", state);
  }

  // start code running
  abstract async start(): Promise<void>;

  // interrupt running code
  abstract async interrupt(): Promise<void>;

  // call to close and free any used space
  abstract close(): void;
}

class CodeExecutorProject extends CodeExecutorAbstract {
  // start code running
  async start(): Promise<void> {}

  // interrupt running code
  async interrupt(): Promise<void> {}

  // call to close and free any used space
  close(): void {
    this._set_state("closed");
  }
}

class CodeExecutorMock extends CodeExecutorAbstract {
  // start code running
  async start(): Promise<void> {
    console.log("start", this.request);
    switch (this.request.code) {
      case "2+2":
        this.emit("output", { stdout: "4" });
        break;
      default:
        this.emit("output", {
          stderr: `Unknown mock code "${this.request.code}"`,
        });
    }
    this._set_state("done");
  }

  // interrupt running code
  async interrupt(): Promise<void> {
    this._set_state("done");
  }

  // call to close and free any used space
  close(): void {
    this._set_state("closed");
  }
}
