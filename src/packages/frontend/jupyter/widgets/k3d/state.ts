/*
TODO:

Obviously having this state shared between every k3d instance across all cells
and notebooks is ridiculous and can't work properly (or at least would be very,
very wasteful). That's the upstream design, and once things work with a single
output, we'll fix it to work properly in general.

*/

export const objects: { [id: number]: any } = {};

export const chunks: { [id: number]: any } = {};

export const plots: any[] = [];

window.state = { objects, chunks, plots };
