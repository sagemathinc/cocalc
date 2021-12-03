export default function isPost(req, res): boolean {
  if (req?.method !== "POST") {
    res?.status(404).json({ message: "must use a POST request" });
    return false;
  }
  return true;
}
