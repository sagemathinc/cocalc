import { conat } from "@cocalc/conat/client";
import type { Subscription } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";
import { isValidUUID } from "@cocalc/util/misc";
import type {
  AcpApprovalDecisionRequest,
  AcpInterruptRequest,
  AcpRequest,
  AcpStreamPayload,
} from "./types";
import pLimit from "p-limit";

const logger = getLogger("conat:ai:acp:server");

const SUBJECT = process.env.COCALC_ACP_TEST ? "acp-test" : "acp";

function buildSubjectPrefix({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id?: string;
}): string {
  if (project_id) {
    return `${SUBJECT}.project-${project_id}`;
  }
  if (account_id) {
    return `${SUBJECT}.account-${account_id}`;
  }
  return `${SUBJECT}.hub`;
}

export function acpSubject(opts: {
  account_id?: string;
  project_id?: string;
}): string {
  return `${buildSubjectPrefix(opts)}.api`;
}

export function acpApprovalSubject(opts: {
  account_id?: string;
  project_id?: string;
}): string {
  return `${buildSubjectPrefix(opts)}.approval`;
}

export function acpInterruptSubject(opts: {
  account_id?: string;
  project_id?: string;
}): string {
  console.log("acpInterruptSubject", {
    opts,
    subject: buildSubjectPrefix(opts),
  });
  return `${buildSubjectPrefix(opts)}.interrupt`;
}

function getUserId(subject: string): string {
  if (subject.startsWith(`${SUBJECT}.account-`)) {
    return subject.slice(
      `${SUBJECT}.account-`.length,
      `${SUBJECT}.account-`.length + 36,
    );
  }
  if (subject.startsWith(`${SUBJECT}.project-`)) {
    return subject.slice(
      `${SUBJECT}.project-`.length,
      `${SUBJECT}.project-`.length + 36,
    );
  }
  return "hub";
}

function getProjectId(subject: string): string | undefined {
  if (subject.startsWith(`${SUBJECT}.project-`)) {
    const id = subject.slice(
      `${SUBJECT}.project-`.length,
      `${SUBJECT}.project-`.length + 36,
    );
    if (isValidUUID(id)) {
      return id;
    }
  }
  return undefined;
}

let apiSub: Subscription | null = null;
let approvalSub: Subscription | null = null;
let interruptSub: Subscription | null = null;
const MAX_CONCURRENCY = Number(process.env.COCALC_ACP_MAX_CONCURRENCY ?? 64);
const limiter = pLimit(MAX_CONCURRENCY);

async function runLimited(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  void limiter(async () => {
    try {
      await fn();
    } catch (err) {
      logger.debug(`error handling acp ${label}`, err);
    }
  });
}

type StreamHandler = (payload?: AcpStreamPayload | null) => Promise<void>;

type EvaluateHandler = (
  options: AcpRequest & { stream: StreamHandler },
) => Promise<void>;

type ApprovalHandler = (options: AcpApprovalDecisionRequest) => Promise<void>;
type InterruptHandler = (options: AcpInterruptRequest) => Promise<void>;

export async function init(
  handlers: {
    evaluate: EvaluateHandler;
    approval?: ApprovalHandler;
    interrupt?: InterruptHandler;
  },
  client,
): Promise<void> {
  client ??= await conat();
  apiSub = await client.subscribe(`${SUBJECT}.*.api`, { queue: "acp-q" });
  listenApi(handlers.evaluate);
  if (handlers.approval) {
    approvalSub = await client.subscribe(`${SUBJECT}.*.approval`, {
      queue: "acp-approval-q",
    });
    listenApprovals(handlers.approval);
  }
  if (handlers.interrupt) {
    interruptSub = await client.subscribe(`${SUBJECT}.*.interrupt`, {
      queue: "acp-interrupt-q",
    });
    listenInterrupts(handlers.interrupt);
  }
}

export async function close(): Promise<void> {
  if (apiSub != null) {
    apiSub.close();
    apiSub = null;
  }
  if (approvalSub != null) {
    approvalSub.close();
    approvalSub = null;
  }
  if (interruptSub != null) {
    interruptSub.close();
    interruptSub = null;
  }
}

function listenApi(evaluate: EvaluateHandler): void {
  if (apiSub == null) throw Error("must init first");
  (async () => {
    for await (const mesg of apiSub!) {
      void runLimited("message", () => handleMessage(mesg, evaluate));
    }
  })().catch((err) => {
    logger.warn("acp api listener stopped", err);
  });
}

function listenApprovals(approvalHandler: ApprovalHandler): void {
  if (approvalSub == null) return;
  (async () => {
    for await (const mesg of approvalSub!) {
      void runLimited("approval", () =>
        handleApprovalMessage(mesg, approvalHandler),
      );
    }
  })().catch((err) => {
    logger.warn("acp approval listener stopped", err);
  });
}

function listenInterrupts(interruptHandler: InterruptHandler): void {
  if (interruptSub == null) return;
  (async () => {
    for await (const mesg of interruptSub!) {
      void runLimited("interrupt", () =>
        handleInterruptMessage(mesg, interruptHandler),
      );
    }
  })().catch((err) => {
    logger.warn("acp interrupt listener stopped", err);
  });
}

async function handleMessage(mesg, evaluate: EvaluateHandler) {
  const options = mesg.data ?? {};
  const project_id = getProjectId(mesg.subject);
  logger.debug("handleMessage", {
    subject: mesg.subject,
    project_id,
    hasChat: !!options.chat,
  });

  let done = false;
  let seq = -1;
  const respond = async (payload?: any, error?: string) => {
    if (done) return;

    seq += 1;
    const data: any = {
      seq,
      ...(payload ?? {}),
    };
    if (error) {
      data.error = error;
      data.type = "error";
    }
    try {
      await mesg.respond(data);
    } catch (err) {
      logger.debug(`ACP respond failed -- ${err}`);
      await end();
    }
  };

  const end = async () => {
    if (done) return;
    done = true;
    await mesg.respond(null, { noThrow: true });
  };

  const stream: StreamHandler = async (payload) => {
    if (done) return;
    if (payload == null) {
      await end();
    } else {
      await respond(payload);
    }
  };

  try {
    // TODO: the account_id is not actually used for anything yet; it should
    // be added somewhere for attribution.  The authentication is by the
    // fact they could write to the subject, which determines the project_id.
    // TODO: Actually, the account_id should be used for approvals as well.
    if (!isValidUUID(options.account_id)) {
      throw Error("account_id must be a valid uuid");
    }

    // In project-scoped requests, derive the project_id from the subject to
    // avoid trusting client-provided IDs. Ensure any provided project_id
    // matches what was derived.
    if (project_id) {
      if (options.project_id && options.project_id !== project_id) {
        throw Error("project_id does not match subject");
      }
      options.project_id = project_id;
      if (options.chat) {
        if (options.chat.project_id && options.chat.project_id !== project_id) {
          throw Error("chat.project_id does not match subject");
        }
        options.chat.project_id = project_id;
      }
    }

    await evaluate({
      ...options,
      prompt: options.prompt ?? "",
      stream,
    });
    await stream(null);
  } catch (err) {
    if (!done) {
      await respond(undefined, `${err}`);
      await end();
    }
  }
}

async function handleApprovalMessage(
  mesg,
  approval: ApprovalHandler,
): Promise<void> {
  const options = mesg.data ?? {};
  const respond = async (payload?: any, error?: string) => {
    const data: any = payload ?? {};
    if (error) {
      data.error = error;
    }
    await mesg.respond(data, { noThrow: true });
  };

  try {
    if (!isValidUUID(options.account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    if (options.account_id !== getUserId(mesg.subject)) {
      throw Error("account_id is invalid");
    }
    await approval(options);
    await respond({ status: "ok" });
  } catch (err) {
    await respond(undefined, `${err}`);
  }
}

async function handleInterruptMessage(
  mesg,
  interrupt: InterruptHandler,
): Promise<void> {
  const options = mesg.data ?? {};
  const respond = async (payload?: any, error?: string) => {
    const data: any = payload ?? {};
    if (error) {
      data.error = error;
    }
    await mesg.respond(data, { noThrow: true });
  };

  try {
    if (!isValidUUID(options.account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    if (options.account_id !== getUserId(mesg.subject)) {
      throw Error("account_id is invalid");
    }
    await interrupt(options);
    await respond();
  } catch (err) {
    await respond(undefined, `${err}`);
  }
}
