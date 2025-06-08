// This is just the default with socket.io, but we might want a bigger
// size, which could mean more RAM usage by the servers.
// Our client protocol automatically chunks messages, so this payload
// size ONLY impacts performance, never application level constraints.
const MB = 1e6;
export const RESOURCE = "connections to CoCalc";

export const MAX_PAYLOAD = 8 * MB;

export const MAX_SUBSCRIPTIONS_PER_CLIENT = 500;
export const MAX_CONNECTIONS_PER_USER = 100;
export const MAX_CONNECTIONS = 10000;
