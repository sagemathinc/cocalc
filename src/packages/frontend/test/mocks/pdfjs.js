module.exports = {
  getDocument() {
    return { promise: Promise.reject(new Error("pdfjs mocked")) };
  },
};
