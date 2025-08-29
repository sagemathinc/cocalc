import httpx
from typing import Any, Optional


class CoCalcAPI:

    def __init__(self, api_key: str, host: str = "https://cocalc.com"):
        self.api_key = api_key
        self.host = host
        self.client = httpx.Client(
            auth=(api_key, ""), headers={"Content-Type": "application/json"})

    def call(self,
             name: str,
             args: list[Any],
             timeout: Optional[int] = None) -> Any:
        payload = {"name": name, "args": args}
        if timeout is not None:
            payload["timeout"] = timeout
        resp = self.client.post(self.host + '/api/hub', json=payload)
        resp.raise_for_status()
        return resp.json()

    # Example structured namespaces
    class _system:

        def __init__(self, parent: "CoCalcAPI"):
            self._parent = parent

        def ping(self) -> Any:
            return self._parent.call("system.ping", [])

        def get_names(self, ids: list[str]) -> Any:
            return self._parent.call("system.getNames", [ids])

    @property
    def system(self):
        return CoCalcAPI._system(self)
