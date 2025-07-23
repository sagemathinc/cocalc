/*
Time service -- tell me what time you think it is.

This is a global service that is run by hubs.
*/

import { createServiceClient, createServiceHandler } from "./typed";
import { getClient } from "@cocalc/conat/client";

interface TimeApi {
  // time in ms since epoch, i.e., Date.now()
  time: () => Promise<number>;
}

const SUBJECT = process.env.COCALC_TEST_MODE ? "time-test" : "time";

interface User {
  account_id?: string;
  project_id?: string;
}

function timeSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    return `${SUBJECT}.hub.api`;
  }
}

export function timeClient(user?: User) {
  if (user == null) {
    user = getClient();
  }
  const subject = timeSubject(user);
  return createServiceClient<TimeApi>({
    service: "time",
    subject,
  });
}

export async function createTimeService() {
  return await createServiceHandler<TimeApi>({
    service: "time",
    subject: `${SUBJECT}.*.api`,
    description: "Time service -- tell me what time you think it is.",
    impl: { time: async () => Date.now() },
  });
}
