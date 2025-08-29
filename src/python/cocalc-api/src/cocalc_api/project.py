import httpx
from typing import Any, Optional
from .util import api_method
from .api_types import PingResponse


class Project:

    def __init__(self,
                 api_key: str,
                 host: str = "https://cocalc.com",
                 project_id: Optional[str] = None):
        self.project_id = project_id
        self.api_key = api_key
        self.host = host
        self.client = httpx.Client(
            auth=(api_key, ""), headers={"Content-Type": "application/json"})

    def call(self,
             name: str,
             arguments: list[Any],
             timeout: Optional[int] = None) -> Any:
        """
        Perform an API call to the CoCalc backend.

        Args:
            name (str): The remote function name to invoke (e.g. "system.ping").
            arguments (list[Any]): Arguments to pass to the remote function.
            timeout (Optional[int]): Timeout in milliseconds. Defaults to None.

        Returns:
            Any: JSON-decoded response from the API.
        """
        payload: dict[str, Any] = {
            "name": name,
            "args": arguments,
            "project_id": self.project_id
        }
        if timeout is not None:
            payload["timeout"] = timeout
        resp = self.client.post(self.host + '/api/conat/project', json=payload)
        resp.raise_for_status()
        return resp.json()

    @property
    def system(self):
        """Access system-level API functions."""
        return System(self)


class System:

    def __init__(self, parent: "Project"):
        self._parent = parent

    @api_method("system.ping")
    def ping(self) -> PingResponse:
        """
        Ping the server.

        Returns:
            Any: JSON object containing the current server time.
            
        Examples:
            Ping a project.  The api_key can be either an account api key or a project
            specific api key (in which case the project_id option is optional):
            
            >>> import cocalc_api;  project = cocalc_api.Project(api_key="sk-...", project_id='...')
            >>> project.ping()
            {'now': 1756489740133}

        """
        raise NotImplementedError
