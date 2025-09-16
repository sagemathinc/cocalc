/*
Project-side exec-stream service that handles streaming execution requests.
Similar to how the project API service works, but specifically for streaming exec.
*/

import { executeStream, StreamEvent  } from "@cocalc/backend/exec-stream";
import { Message, Subscription } from "@cocalc/conat/core/client";
import { projectSubject } from "@cocalc/conat/names";
import { connectToConat } from "@cocalc/project/conat/connection";
import { project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("project:exec-stream");



export function init() {
  serve();
}

async function serve() {
  logger.debug("serve: create project exec-stream service");
  const cn = connectToConat();
  const subject = projectSubject({
    project_id,
    compute_server_id: 0, // This is the project service, always 0
    service: "exec-stream",
  });

  logger.debug(
    `serve: creating exec-stream service for project ${project_id} and subject='${subject}'`,
  );
  const api = await cn.subscribe(subject, { queue: "q" });
  await listen(api, subject);
}

async function listen(api: Subscription, subject: string) {
  logger.debug(`Listening on subject='${subject}'`);

  for await (const mesg of api) {
    handleMessage(mesg);
  }
}

async function handleMessage(mesg: Message) {
  const options = mesg.data;

  let seq = 0;
  const respond = ({ type, data, error }: StreamEvent) => {
    mesg.respondSync({ type, data, error, seq });
    seq += 1;
  };

  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    // end response stream with null payload.
    mesg.respondSync(null);
  };

  const stream = (event: StreamEvent) => {
    if (done) return;
    if (event != null) {
      respond(event);
    } else {
      end();
    }
  };

  try {
    // SECURITY: verify that the project_id claimed in options matches
    // with our actual project_id
    if (options.project_id != project_id) {
      throw Error("project_id is invalid");
    }

    const { stream: _, project_id: reqProjectId, ...opts } = options;

    // Call the backend executeStream function
    await executeStream({
      ...opts,
      project_id: reqProjectId,
      stream,
    });
  } catch (err) {
    if (!done) {
      respond({ error: `${err}` });
      end();
    }
  }
}
