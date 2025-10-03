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


class MessageType(TypedDict):
    id: int
    from_id: str
    to_ids: list[str]
    subject: str
    body: str
    sent: Optional[str]
    thread_id: Optional[int]
    index: Optional[int]
    read: Optional[bool]
    saved: Optional[bool]
    starred: Optional[bool]
    liked: Optional[bool]
    deleted: Optional[bool]
    expire: Optional[bool]


class TokenType(TypedDict):
    token: str
    url: str


class OrganizationUser(TypedDict):
    first_name: Optional[str]
    last_name: Optional[str]
    email_address: Optional[str]
    account_id: str
