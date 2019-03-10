function capabilities(): object {
  return {
    latex: true,
    sagews: true
  };
}

export function get_configuration(): object {
  return {
    timestamp: new Date(),
    capabilities: capabilities()
  };
}
