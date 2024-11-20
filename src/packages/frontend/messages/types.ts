import type { Message } from "@cocalc/util/db-schema/messages";
export type Threads = { [thread_id: number]: Message[] };
