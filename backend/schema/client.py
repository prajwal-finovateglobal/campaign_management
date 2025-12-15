from pydantic import BaseModel


class ClientTableNameResponse(BaseModel):
    client_id: int
    table_name: str

