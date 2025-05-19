/*
Tools for stress testing nats so we understand it better.

NOTHING USEFUL HERE NOW
*/

export function intToUuid(n) {
  const base8 = n.toString(8);
  const padded = base8.padStart(32, "0");
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20, 32)}`;
}

export function progress({ n, stop }) {
  console.log(`${n}/${stop}`);
}
