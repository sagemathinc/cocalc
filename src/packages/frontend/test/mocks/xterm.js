class Terminal {
  open() {}
  loadAddon() {}
  write() {}
  writeln() {}
  focus() {}
  reset() {}
  clear() {}
  dispose() {}
  onData() {
    return { dispose() {} };
  }
  onBinary() {
    return { dispose() {} };
  }
  onResize() {
    return { dispose() {} };
  }
  onTitleChange() {
    return { dispose() {} };
  }
}

module.exports = { Terminal };
