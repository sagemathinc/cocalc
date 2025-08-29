from typing import TypedDict


class PingResponse(TypedDict):
    now: int


class ExecuteCodeOutput(TypedDict):
    stdout: str
    stderr: str
    exit_code: int
