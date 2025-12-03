// Lightweight flag for project-host frontends.
// Mirrors frontend/lite/index.ts but without any extra state setup.

export let projectHost = false;

export function init(): void {
  projectHost = true;
}
