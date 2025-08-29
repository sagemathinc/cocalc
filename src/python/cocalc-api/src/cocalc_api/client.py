import httpx
from typing import Any, Optional
from .util import api_method


class CoCalcAPI:

    def __init__(self, api_key: str, host: str = "https://cocalc.com"):
        self.api_key = api_key
        self.host = host
        self.client = httpx.Client(
            auth=(api_key, ""), headers={"Content-Type": "application/json"})

    def call(self,
             name: str,
             arguments: list[Any],
             timeout: Optional[int] = None) -> Any:
        payload: dict[str, Any] = {"name": name, "args": arguments}
        if timeout is not None:
            payload["timeout"] = timeout        
        resp = self.client.post(self.host + '/api/conat/hub', json=payload)
        resp.raise_for_status()
        return resp.json()

    @property
    def system(self):
        return System(self)

    @property
    def projects(self):
        return Projects(self)


class System:

    def __init__(self, parent: "CoCalcAPI"):
        self._parent = parent

    def ping(self) -> Any:
        """
        Ping the server. Returns the current server time.
        """
        return self._parent.call("system.ping", [])

    def get_names(self, account_ids: list[str]) -> Any:
        """
        Get the displayed names of CoCalc accounts with given account_ids.
        
        - account_ids -- list of uuid strings
        """
        return self._parent.call("system.getNames", [account_ids])


class Projects:

    def __init__(self, parent: "CoCalcAPI"):
        self._parent = parent

    @api_method("projects.copyPathBetweenProjects")
    def copy_path_between_projects(
        self,
        src_project_id: str,
        src_path: str,
        target_project_id: Optional[str] = None,
        target_path: Optional[str] = None,
    ):
        """
        Copy a path from one project to another (or within a project).
        
        - src_project_id -- the source project_id
        - src_path -- the source path
        - target_project_id -- the target project_id (optional, defaults to src_project_id)
        - target_path - the target path (optional, defaults to src_path)
        """
        ...

    @api_method("projects.createProject")
    def create_project(
        self,
        title: Optional[str] = None,
        description: Optional[str] = None,
        license: Optional[str] = None,
        public_path_id: Optional[str] = None,
    ) -> str:
        """
        Create a new project that you own.
        
        - title -- optional title of the project
        - description -- optional description of project
        - license -- optional license id (or multiple ids separated by commas) -- if given, project will be created with this license
        - public_path_id -- optional; if given, project is initially populated with content from this publically shared path
        
        Returns the project_id as a string.
        """
        raise NotImplementedError

    @api_method("projects.addCollaborator", opts=True)
    def add_collaborator(self, project_id: str | list[str],
                         account_id: str | list[str]):
        """
        Add a collaborator to a project.
        
        - project_id -- the project to add a user to
        - account_id -- account_id of the user to add
        
        NOTE: You can also pass in arrows of the same size for project_id and account_id to add
        several collaborators to projects at once.  In this case account_id[i] is added to project_id[i].
        """
        ...
