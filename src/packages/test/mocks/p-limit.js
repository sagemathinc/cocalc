// Simple Jest-friendly mock of p-limit. Concurrency is ignored and tasks run immediately.
module.exports = function pLimitMock() {
  return async (fn, ...args) => await fn(...args);
};
