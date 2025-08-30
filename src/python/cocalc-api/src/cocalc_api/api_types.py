from typing import TypedDict, Optional


class PingResponse(TypedDict):
    now: int


class ExecuteCodeOutput(TypedDict):
    stdout: str
    stderr: str
    exit_code: int


class UserSearchResult(TypedDict):
    account_id: str
    first_name: Optional[str]
    last_name: Optional[str]
    # "vanity" username
    name: Optional[str]
    # ms since epoch -- when account was last active
    last_active: Optional[int]
    # ms since epoch -- when account created
    created: Optional[int]
    # true if their email has been verified (a sign they are more trustworthy).
    email_address_verified: Optional[bool]
