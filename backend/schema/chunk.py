from pydantic import BaseModel
from typing import List, Optional


class CalculateChunksRequest(BaseModel):
    campaign_id: int
    chunk_size: int


class ChunkPreview(BaseModel):
    chunk_number: int
    chunk_name: str
    records_range: str
    records_count: int


class CalculateChunksResponse(BaseModel):
    success: bool
    campaign_name: str
    total_records: int
    chunk_size: int
    number_of_chunks: int
    chunks_preview: List[ChunkPreview]
    message: Optional[str] = None


class CreateChunksRequest(BaseModel):
    campaign_id: int
    chunk_size: int


class ChunkDetail(BaseModel):
    id: int
    chunk_name: str
    campaign_id: int
    records_count: int
    status: Optional[str] = None
    cid: Optional[str] = None
    phone_id: Optional[str] = None
    agent_id: Optional[str] = None
    upload_status: Optional[str] = None
    created_at: Optional[str] = None


class CreateChunksResponse(BaseModel):
    success: bool
    message: str
    chunks_created: int
    chunks: List[ChunkDetail]


class GetChunksResponse(BaseModel):
    success: bool
    campaign_id: int
    campaign_name: str
    chunks: List[ChunkDetail]
    total_chunks: int


class UpsertAllChunksRequest(BaseModel):
    campaign_id: int


class UpsertAllChunksResponse(BaseModel):
    success: bool
    message: str
    chunks_upserted: int
    total_records: int
    failed_chunks: Optional[List[str]] = None


class UpsertSingleChunkRequest(BaseModel):
    chunk_id: int
    chunk_index: int
    chunk_size: int


class UpsertSingleChunkResponse(BaseModel):
    success: bool
    message: str
    chunk_id: int
    chunk_name: str
    cid: Optional[str] = None
    records_uploaded: int
    status: Optional[str] = None

