// NOTE: keys here also assumed to be the flavors without a gpu below!
const HUMAN = {
  s: "n1-cpu-extrasmall",
  m: "n1-cpu-verysmall",
  l: "n1-cpu-small",
  xxl: "n1-cpu-large",
};

export function humanFlavor(flavor_name: string) {
  return HUMAN[flavor_name] ?? flavor_name;
}

const noGPU = new Set(Object.keys(HUMAN));
export function hasGPU(flavor_name: string) {
  return !noGPU.has(flavor_name);
}
