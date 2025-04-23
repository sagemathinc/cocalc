/*
Client for the tiered server.
*/

import { getEnv } from "@cocalc/nats/client";
import { isValidUUID } from "@cocalc/util/misc";
import { waitUntilConnected } from "@cocalc/nats/util";

import { type State, type User, type Stats } from "./server";

export async function state(user: User): Promise<State> {}

export async function restore(user: User): Promise<Stats> {}

export async function archive(user: User): Promise<Stats> {}

// TODO:
