from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

class NodePosition(BaseModel):
    id: str
    type: str = "custom"
    position: Dict[str, float]  # {x: float, y: float}
    data: Dict[str, Any]

class EdgeData(BaseModel):
    id: str
    source: str
    target: str
    type: Optional[str] = None
    animated: Optional[bool] = None
    style: Optional[Dict[str, Any]] = None
    sourceHandle: Optional[str] = None  # Handle on source node (right, left, bottom)
    targetHandle: Optional[str] = None  # Handle on target node (top)

class DispositionTreeState(BaseModel):
    nodes: List[NodePosition]
    edges: List[EdgeData]
    timestamp: Optional[str] = None

class SaveDispositionTreeRequest(BaseModel):
    share_id: str
    state: DispositionTreeState

class SaveDispositionTreeResponse(BaseModel):
    success: bool
    message: str
    share_id: str

class GetDispositionTreeResponse(BaseModel):
    success: bool
    state: Optional[DispositionTreeState] = None
    message: Optional[str] = None

class SaveNodePositionsRequest(BaseModel):
    positions: List[NodePosition]
    edges: Optional[List[EdgeData]] = None  # Include edges to save structure
    timestamp: Optional[str] = None

class SaveNodePositionsResponse(BaseModel):
    success: bool
    message: str

class GetNodePositionsResponse(BaseModel):
    success: bool
    positions: Optional[List[NodePosition]] = None
    edges: Optional[List[EdgeData]] = None  # Include edges to restore structure
    message: Optional[str] = None

