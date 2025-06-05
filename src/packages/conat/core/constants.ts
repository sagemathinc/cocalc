// This is just the default with socket.io, but we might want a bigger
// size, which could mean more RAM usage by the servers.
// Our client protocol automatically chunks messages, so this payload
// size ONLY impacts performance, never application level constraints.
const MB = 1e6;
export const MAX_PAYLOAD = 1 * MB;
export const MAX_DISCONNECTION_DURATION = 2 * 60 * 1000;
export const MAX_SUBSCRIPTIONS_PER_CLIENT = 500;

