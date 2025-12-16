from fastapi import APIRouter, HTTPException
from schema.disposition import (
    SaveDispositionTreeRequest,
    SaveDispositionTreeResponse,
    GetDispositionTreeResponse,
    DispositionTreeState,
    SaveNodePositionsRequest,
    SaveNodePositionsResponse,
    GetNodePositionsResponse
)
from service.disposition import (
    save_disposition_tree_state,
    load_disposition_tree_state,
    delete_disposition_tree_state,
    save_node_positions,
    load_node_positions
)
import loguru

router = APIRouter()
logger = loguru.logger


@router.post("/disposition-tree/save", response_model=SaveDispositionTreeResponse)
def save_disposition_tree(request: SaveDispositionTreeRequest):
    """
    Save disposition tree state to a JSON file.
    
    Args:
        request: Request containing share_id and state data
    
    Returns:
        Success response with share_id
    """
    logger.info(f"Saving disposition tree state for share_id: {request.share_id}")
    
    # Convert Pydantic model to dict
    state_dict = {
        "nodes": [node.dict() for node in request.state.nodes],
        "edges": [edge.dict() for edge in request.state.edges],
        "timestamp": request.state.timestamp or None
    }
    
    success, message = save_disposition_tree_state(request.share_id, state_dict)
    
    if not success:
        raise HTTPException(status_code=500, detail=message)
    
    return SaveDispositionTreeResponse(
        success=True,
        message=message,
        share_id=request.share_id
    )


# IMPORTANT: Specific routes must come BEFORE parameterized routes
# Otherwise /disposition-tree/positions matches /disposition-tree/{share_id}
@router.post("/disposition-tree/positions/save", response_model=SaveNodePositionsResponse)
def save_node_positions_endpoint(request: SaveNodePositionsRequest):
    """
    Save node positions and edges to backend storage.
    
    Args:
        request: Request containing node positions and edges
    
    Returns:
        Success response
    """
    logger.info(f"Saving {len(request.positions)} node positions and {len(request.edges or [])} edges")
    
    # Convert Pydantic models to dicts
    positions_dict = [pos.dict() for pos in request.positions]
    edges_dict = [edge.dict() for edge in (request.edges or [])]
    
    success, message = save_node_positions(positions_dict, edges_dict)
    
    if not success:
        raise HTTPException(status_code=500, detail=message)
    
    return SaveNodePositionsResponse(
        success=True,
        message=message
    )


@router.get("/disposition-tree/positions", response_model=GetNodePositionsResponse)
def get_node_positions_endpoint():
    """
    Load node positions and edges from backend storage.
    
    Returns:
        Node positions and edges if found
    """
    logger.info("Loading node positions and edges")
    
    success, positions, edges, message = load_node_positions()
    
    if not success:
        raise HTTPException(status_code=404, detail=message)
    
    # Convert dicts to Pydantic models
    from schema.disposition import NodePosition, EdgeData
    position_models = [NodePosition(**pos) for pos in positions] if positions else []
    edge_models = [EdgeData(**edge) for edge in edges] if edges else []
    
    return GetNodePositionsResponse(
        success=True,
        positions=position_models,
        edges=edge_models,
        message=message
    )


@router.get("/disposition-tree/{share_id}", response_model=GetDispositionTreeResponse)
def get_disposition_tree(share_id: str):
    """
    Load disposition tree state from a JSON file.
    
    Args:
        share_id: Unique identifier for the shared state
    
    Returns:
        State data if found, error message otherwise
    """
    logger.info(f"Loading disposition tree state for share_id: {share_id}")
    
    success, state, message = load_disposition_tree_state(share_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=message)
    
    # Convert dict to Pydantic model
    try:
        tree_state = DispositionTreeState(
            nodes=state["nodes"],
            edges=state["edges"],
            timestamp=state.get("timestamp")
        )
        
        return GetDispositionTreeResponse(
            success=True,
            state=tree_state,
            message=message
        )
    except Exception as e:
        logger.error(f"Error parsing state data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error parsing state data: {str(e)}")


@router.delete("/disposition-tree/{share_id}")
def delete_disposition_tree(share_id: str):
    """
    Delete a disposition tree state file.
    
    Args:
        share_id: Unique identifier for the shared state
    
    Returns:
        Success message
    """
    logger.info(f"Deleting disposition tree state for share_id: {share_id}")
    
    success, message = delete_disposition_tree_state(share_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=message)
    
    return {"success": True, "message": message}

