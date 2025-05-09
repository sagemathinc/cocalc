/*
Time service -- tell me what time you think it is.

This is a global service that is run by hubs.
*/

import { createServiceClient, createServiceHandler } from "./typed";

interface TimeApi {
  // time in ms since epoch, i.e., Date.now()
  time: () => Promise<number>;
}

export function timeClient() {
  return createServiceClient<TimeApi>({
    service: "time",
  });
}

export async function createTimeService() {
  return await createServiceHandler<TimeApi>({
    service: "time",
    description: "Time service -- tell me what time you think it is.",
    impl: { time: async () => Date.now() },
  });
}
