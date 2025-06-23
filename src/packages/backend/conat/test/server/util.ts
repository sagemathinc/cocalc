import { wait } from "@cocalc/backend/conat/test/setup";

export async function waitForSubscription(server, subject) {
  await wait({
    until: () => {
      return server.interest.patterns[subject] !== undefined;
    },
  });
}

export async function waitForNonSubscription(server, subject) {
  await wait({
    until: () => {
      return server.interest.patterns[subject] === undefined;
    },
  });
}

export async function waitForSticky(server, subject) {
  await wait({
    until: () => {
      return server.sticky[subject] !== undefined;
    },
  });
}
