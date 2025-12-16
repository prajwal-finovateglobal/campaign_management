import json
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import loguru

logger = loguru.logger

# Directory to store shared disposition tree states
DISPOSITION_STORAGE_DIR = Path(__file__).parent.parent / "data" / "disposition_shares"
DISPOSITION_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def save_disposition_tree_state(share_id: str, state: Dict[str, Any]) -> tuple[bool, str]:
    """
    Save disposition tree state to a JSON file.
    
    Args:
        share_id: Unique identifier for the shared state
        state: Dictionary containing nodes, edges, and timestamp
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        file_path = DISPOSITION_STORAGE_DIR / f"{share_id}.json"
        
        # Add timestamp if not present
        if "timestamp" not in state:
            state["timestamp"] = datetime.now().isoformat()
        
        # Write to JSON file
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved disposition tree state for share_id: {share_id}")
        return True, f"State saved successfully"
    
    except Exception as e:
        logger.error(f"Error saving disposition tree state: {str(e)}")
        return False, f"Failed to save state: {str(e)}"


def load_disposition_tree_state(share_id: str) -> tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Load disposition tree state from a JSON file.
    
    Args:
        share_id: Unique identifier for the shared state
    
    Returns:
        Tuple of (success: bool, state: Optional[Dict], message: str)
    """
    try:
        file_path = DISPOSITION_STORAGE_DIR / f"{share_id}.json"
        
        if not file_path.exists():
            return False, None, f"Share ID '{share_id}' not found"
        
        # Read from JSON file
        with open(file_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        logger.info(f"Loaded disposition tree state for share_id: {share_id}")
        return True, state, "State loaded successfully"
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON for share_id {share_id}: {str(e)}")
        return False, None, f"Invalid JSON file: {str(e)}"
    except Exception as e:
        logger.error(f"Error loading disposition tree state: {str(e)}")
        return False, None, f"Failed to load state: {str(e)}"


def delete_disposition_tree_state(share_id: str) -> tuple[bool, str]:
    """
    Delete a disposition tree state file.
    
    Args:
        share_id: Unique identifier for the shared state
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        file_path = DISPOSITION_STORAGE_DIR / f"{share_id}.json"
        
        if not file_path.exists():
            return False, f"Share ID '{share_id}' not found"
        
        file_path.unlink()
        logger.info(f"Deleted disposition tree state for share_id: {share_id}")
        return True, "State deleted successfully"
    
    except Exception as e:
        logger.error(f"Error deleting disposition tree state: {str(e)}")
        return False, f"Failed to delete state: {str(e)}"


def save_node_positions(positions: List[Dict[str, Any]], edges: Optional[List[Dict[str, Any]]] = None) -> tuple[bool, str]:
    """
    Save node positions and edges to a JSON file.
    
    Args:
        positions: List of node position dictionaries
        edges: Optional list of edge dictionaries
    
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        file_path = DISPOSITION_STORAGE_DIR / "node_positions.json"
        
        state = {
            "positions": positions,
            "edges": edges or [],
            "timestamp": datetime.now().isoformat()
        }
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved {len(positions)} node positions and {len(edges or [])} edges")
        return True, f"Saved {len(positions)} node positions and {len(edges or [])} edges successfully"
    
    except Exception as e:
        logger.error(f"Error saving node positions: {str(e)}")
        return False, f"Failed to save positions: {str(e)}"


def load_node_positions() -> tuple[bool, Optional[List[Dict[str, Any]]], Optional[List[Dict[str, Any]]], str]:
    """
    Load node positions and edges from a JSON file.
    
    Returns:
        Tuple of (success: bool, positions: Optional[List], edges: Optional[List], message: str)
    """
    try:
        file_path = DISPOSITION_STORAGE_DIR / "node_positions.json"
        
        if not file_path.exists():
            return False, None, None, "No saved positions found"
        
        with open(file_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        positions = state.get("positions", [])
        edges = state.get("edges", [])
        logger.info(f"Loaded {len(positions)} node positions and {len(edges)} edges")
        return True, positions, edges, f"Loaded {len(positions)} node positions and {len(edges)} edges successfully"
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON: {str(e)}")
        return False, None, None, f"Invalid JSON file: {str(e)}"
    except Exception as e:
        logger.error(f"Error loading node positions: {str(e)}")
        return False, None, None, f"Failed to load positions: {str(e)}"

