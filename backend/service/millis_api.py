"""
Service for interacting with Millis.ai API.
Handles fetching campaign details and record counts.
"""
import requests
from typing import List, Dict, Any, Optional, Tuple
import loguru
from Core.config import MILLIS_API_KEY, MILLIS_API_BASE_URL

logger = loguru.logger.bind(service="millis_api")


def get_campaign_details(cids: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch campaign details from Millis.ai API for given campaign IDs.
    
    Args:
        cids: List of campaign IDs (cid) to fetch details for
    
    Returns:
        Dictionary mapping cid to campaign details with record_count
        Format: {
            "cid1": {
                "id": "...",
                "name": "...",
                "status": "...",
                "record_count": 10,
                ...
            },
            ...
        }
    """
    if not MILLIS_API_KEY:
        logger.warning("MILLIS_API_KEY not configured")
        return {}
    
    if not cids:
        logger.info("No CIDs provided, returning empty dict")
        return {}
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"Fetching campaign details for {len(cids)} CIDs from Millis.ai")
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"Millis.ai API returned status {response.status_code}: {response.text}")
            return {}
        
        campaigns_data = response.json()
        logger.info(f"Received {len(campaigns_data)} campaigns from Millis.ai")
        
        # Create a mapping of cid to campaign details
        cid_to_campaign = {}
        cid_set = set(cids)
        
        for campaign in campaigns_data:
            campaign_id = campaign.get("id")
            if campaign_id in cid_set:
                # Count records
                records = campaign.get("records", [])
                record_count = len(records) if records else 0
                
                # Extract status directly from API response
                # Status values from Millis.ai can be: "finished", "idle", "active", "running", etc.
                status = campaign.get("status")
                
                cid_to_campaign[campaign_id] = {
                    **campaign,
                    "record_count": record_count,
                    "status": status  # Status is already in campaign object, but explicitly set for clarity
                }
                logger.debug(f"Found campaign {campaign_id} with {record_count} records, status: {status}")
        
        logger.info(f"Matched {len(cid_to_campaign)} campaigns out of {len(cids)} requested")
        return cid_to_campaign
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching campaign details from Millis.ai: {e}")
        return {}
    except Exception as e:
        logger.error(f"Unexpected error in get_campaign_details: {e}")
        return {}


def get_campaign_record_count(cid: str) -> Optional[int]:
    """
    Get record count for a single campaign ID.
    
    Args:
        cid: Campaign ID to get record count for
    
    Returns:
        Record count if found, None otherwise
    """
    if not cid:
        return None
    
    campaign_details = get_campaign_details([cid])
    if cid in campaign_details:
        return campaign_details[cid].get("record_count")
    return None


def delete_campaign_in_millis(campaign_id: str) -> Tuple[bool, Optional[str]]:
    """
    Delete a campaign from Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) to delete from Millis.ai
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"Deleting campaign '{campaign_id}' from Millis.ai")
        response = requests.delete(url, headers=headers, timeout=30)
        
        if response.status_code not in [200, 204]:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg
        
        logger.info(f"Successfully deleted campaign {campaign_id} from Millis.ai")
        return True, None
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error deleting campaign from Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in delete_campaign_in_millis: {e}"
        logger.error(error_msg)
        return False, error_msg


def upload_records_to_millis(campaign_id: str, records: List[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
    """
    Upload records to a campaign in Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
        records: List of records with phone and metadata
            Format: [{"phone": "<string>", "metadata": {}}, ...]
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(error_msg)
        return False, error_msg
    
    if not records:
        error_msg = "No records provided"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/records"
        headers = {
            "Content-Type": "application/json",
            "authorization": MILLIS_API_KEY
        }
        
        # Format records for Millis.ai API
        formatted_records = []
        for record in records:
            formatted_record = {
                "phone": record.get("phone", ""),
                "metadata": record.get("metadata", {})
            }
            formatted_records.append(formatted_record)
        
        logger.info(f"Uploading {len(formatted_records)} records to campaign {campaign_id} in Millis.ai")
        response = requests.post(url, json=formatted_records, headers=headers, timeout=30)
        
        if response.status_code not in [200, 201]:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg
        
        logger.info(f"Successfully uploaded {len(formatted_records)} records to campaign {campaign_id}")
        return True, None
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error uploading records to Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in upload_records_to_millis: {e}"
        logger.error(error_msg)
        return False, error_msg


def create_campaign_in_millis(campaign_name: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Create a campaign in Millis.ai API.
    
    Args:
        campaign_name: Name of the campaign to create
    
    Returns:
        Tuple of (success, error_message, campaign_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_data: Dict with campaign details if succeeded, None if failed
            Format: {
                "id": "<string>",
                "name": "<string>",
                "status": "idle",
                "records": [...],
                "created_at": 123,
                "record_count": 0
            }
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg, None
    
    if not campaign_name:
        error_msg = "Campaign name is required"
        logger.error(error_msg)
        return False, error_msg, None
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns"
        headers = {
            "authorization": MILLIS_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "name": campaign_name
        }
        
        logger.info(f"Creating campaign '{campaign_name}' in Millis.ai")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg, None
        
        campaign_data = response.json()
        logger.info(f"Successfully created campaign in Millis.ai: {campaign_data.get('id')}")
        
        # Extract and structure the response
        campaign_id = campaign_data.get("id")
        name = campaign_data.get("name")
        status = campaign_data.get("status", "idle")
        records = campaign_data.get("records", [])
        record_count = len(records) if records else 0
        created_at = campaign_data.get("created_at")
        
        return True, None, {
            "id": campaign_id,
            "name": name,
            "status": status,
            "records": records,
            "created_at": created_at,
            "record_count": record_count
        }
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error creating campaign in Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Unexpected error in create_campaign_in_millis: {e}"
        logger.error(error_msg)
        return False, error_msg, None


def get_phones() -> Tuple[bool, Optional[str], Optional[List[Dict[str, Any]]]]:
    """
    Get all phones from Millis.ai API.
    
    Returns:
        Tuple of (success, error_message, phones_list)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - phones_list: List of phone objects if succeeded, None if failed
            Format: [
                {
                    "id": "+911140848678",
                    "agent_id": "-Of8z0Mox2OiYLUUryT3",
                    "create_at": 1749202201.1858394,
                    "status": "active"
                },
                ...
            ]
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg, None
    
    try:
        url = f"{MILLIS_API_BASE_URL}/phones"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info("Fetching phones from Millis.ai")
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg, None
        
        phones_data = response.json()
        logger.info(f"Successfully fetched {len(phones_data)} phones from Millis.ai")
        
        return True, None, phones_data
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error fetching phones from Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Unexpected error in get_phones: {e}"
        logger.error(error_msg)
        return False, error_msg, None


def get_agent(agent_id: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Get agent details from Millis.ai API.
    
    Args:
        agent_id: Agent ID to fetch details for
    
    Returns:
        Tuple of (success, error_message, agent_data)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - agent_data: Agent details if succeeded, None if failed
            Format: {
                "id": "-OgBl_Ol5CfX4F0XcB7_",
                "name": "SSFL JSON 11th Dec 2025",
                "config": {...},
                ...
            }
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg, None
    
    if not agent_id:
        error_msg = "Agent ID is required"
        logger.error(error_msg)
        return False, error_msg, None
    
    try:
        url = f"{MILLIS_API_BASE_URL}/agents/{agent_id}"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"Fetching agent {agent_id} from Millis.ai")
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg, None
        
        agent_data = response.json()
        logger.info(f"Successfully fetched agent {agent_id} from Millis.ai")
        
        return True, None, agent_data
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error fetching agent from Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Unexpected error in get_agent: {e}"
        logger.error(error_msg)
        return False, error_msg, None


def set_caller(campaign_id: str, caller_phone: str) -> Tuple[bool, Optional[str]]:
    """
    Set caller phone for a campaign in Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
        caller_phone: Phone number to set as caller (e.g., "+918045889078")
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(error_msg)
        return False, error_msg
    
    if not caller_phone:
        error_msg = "Caller phone is required"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/set_caller"
        headers = {
            "authorization": MILLIS_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "caller": caller_phone
        }
        
        logger.info(f"Setting caller {caller_phone} for campaign {campaign_id} in Millis.ai")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg
        
        # Handle empty response or non-JSON response
        response_text = response.text.strip()
        if not response_text:
            # Empty response might mean success, check status code
            if response.status_code == 200:
                logger.info(f"Successfully set caller {caller_phone} for campaign {campaign_id} (empty response)")
                return True, None
            else:
                error_msg = f"Millis.ai API returned empty response with status {response.status_code}"
                logger.error(error_msg)
                return False, error_msg
        
        # Try to parse JSON response
        try:
            result = response.json()
            # Check if response has success field
            if isinstance(result, dict) and "success" in result:
                if not result.get("success", False):
                    error_msg = f"Millis.ai API returned success=false: {result}"
                    logger.error(error_msg)
                    return False, error_msg
            # If no success field but status is 200, assume success
            logger.info(f"Successfully set caller {caller_phone} for campaign {campaign_id}")
            return True, None
        except ValueError as e:
            # If response is not JSON but status is 200, assume success
            if response.status_code == 200:
                logger.info(f"Successfully set caller {caller_phone} for campaign {campaign_id} (non-JSON response: {response_text[:100]})")
                return True, None
            else:
                error_msg = f"Millis.ai API returned invalid JSON: {response_text[:200]}"
                logger.error(error_msg)
                return False, error_msg
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error setting caller in Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in set_caller: {e}"
        logger.error(error_msg)
        return False, error_msg


def get_campaign_info(campaign_id: str) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Get campaign info from Millis.ai API using /campaigns/{cid}/info endpoint.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
    
    Returns:
        Tuple of (success, error_message, campaign_info)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
        - campaign_info: Campaign info dictionary if succeeded, None if failed
    """
    logger.info(f"[MILLIS_API] get_campaign_info called with campaign_id (CID): {campaign_id}")
    
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(f"[MILLIS_API] ERROR: {error_msg}")
        return False, error_msg, None
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(f"[MILLIS_API] ERROR: {error_msg}")
        return False, error_msg, None
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/info"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"[MILLIS_API] Making GET request to Millis.ai API")
        logger.info(f"[MILLIS_API] URL: {url}")
        logger.info(f"[MILLIS_API] Campaign ID (CID): {campaign_id}")
        
        response = requests.get(url, headers=headers, timeout=30)
        
        logger.info(f"[MILLIS_API] Response received - Status Code: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(f"[MILLIS_API] ERROR: {error_msg}")
            return False, error_msg, None
        
        try:
            campaign_info = response.json()
            logger.info(f"[MILLIS_API] Successfully fetched campaign info for CID: {campaign_id}")
            logger.info(f"[MILLIS_API] Campaign info fields: {list(campaign_info.keys())}")
            logger.debug(f"[MILLIS_API] Full campaign info: {campaign_info}")
            return True, None, campaign_info
        except ValueError as e:
            error_msg = f"Millis.ai API returned invalid JSON: {response.text[:200]}"
            logger.error(f"[MILLIS_API] ERROR: {error_msg}")
            return False, error_msg, None
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error fetching campaign info from Millis.ai: {e}"
        logger.error(f"[MILLIS_API] REQUEST_EXCEPTION: {error_msg}")
        logger.exception(f"[MILLIS_API] Full exception traceback for campaign {campaign_id}")
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Unexpected error in get_campaign_info: {e}"
        logger.error(f"[MILLIS_API] EXCEPTION: {error_msg}")
        logger.exception(f"[MILLIS_API] Full exception traceback for campaign {campaign_id}")
        return False, error_msg, None


def start_campaign(campaign_id: str) -> Tuple[bool, Optional[str]]:
    """
    Start a campaign in Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    logger.info(f"[MILLIS_API] start_campaign called with campaign_id (CID): {campaign_id}")
    
    # Validate API key
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(f"[MILLIS_API] ERROR: {error_msg}")
        return False, error_msg
    
    # Validate campaign_id
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(f"[MILLIS_API] ERROR: {error_msg}")
        return False, error_msg
    
    try:
        # Construct API URL and headers
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/start"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"[MILLIS_API] Making POST request to Millis.ai API")
        logger.info(f"[MILLIS_API] URL: {url}")
        logger.info(f"[MILLIS_API] Campaign ID (CID): {campaign_id}")
        logger.info(f"[MILLIS_API] Headers: authorization=[REDACTED]")
        
        # Make API request
        response = requests.post(url, headers=headers, timeout=30)
        
        logger.info(f"[MILLIS_API] Response received - Status Code: {response.status_code}")
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(f"[MILLIS_API] ERROR: {error_msg}")
            logger.error(f"[MILLIS_API] Failed to start campaign CID: {campaign_id}")
            return False, error_msg
        
        # Handle empty response or non-JSON response
        response_text = response.text.strip()
        if not response_text:
            if response.status_code == 200:
                logger.info(f"[MILLIS_API] SUCCESS: Campaign {campaign_id} started successfully (empty response)")
                return True, None
            else:
                error_msg = f"Millis.ai API returned empty response with status {response.status_code}"
                logger.error(f"[MILLIS_API] ERROR: {error_msg}")
                return False, error_msg
        
        # Try to parse JSON response
        try:
            result = response.json()
            logger.info(f"[MILLIS_API] Response JSON: {result}")
            if isinstance(result, dict) and "success" in result:
                if not result.get("success", False):
                    error_msg = f"Millis.ai API returned success=false: {result}"
                    logger.error(f"[MILLIS_API] ERROR: {error_msg}")
                    return False, error_msg
            logger.info(f"[MILLIS_API] SUCCESS: Campaign {campaign_id} started successfully")
            return True, None
        except ValueError as e:
            if response.status_code == 200:
                logger.info(f"[MILLIS_API] SUCCESS: Campaign {campaign_id} started successfully (non-JSON response: {response_text[:100]})")
                return True, None
            else:
                error_msg = f"Millis.ai API returned invalid JSON: {response_text[:200]}"
                logger.error(f"[MILLIS_API] ERROR: {error_msg}")
                return False, error_msg
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error starting campaign in Millis.ai: {e}"
        logger.error(f"[MILLIS_API] REQUEST_EXCEPTION: {error_msg}")
        logger.exception(f"[MILLIS_API] Full exception traceback for campaign {campaign_id}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in start_campaign: {e}"
        logger.error(f"[MILLIS_API] EXCEPTION: {error_msg}")
        logger.exception(f"[MILLIS_API] Full exception traceback for campaign {campaign_id}")
        return False, error_msg


def stop_campaign_millis(campaign_id: str) -> Tuple[bool, Optional[str]]:
    """
    Stop a campaign in Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/stop"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"Stopping campaign {campaign_id} in Millis.ai")
        response = requests.post(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg
        
        # Handle empty response or non-JSON response
        response_text = response.text.strip()
        if not response_text:
            if response.status_code == 200:
                logger.info(f"Successfully stopped campaign {campaign_id} (empty response)")
                return True, None
            else:
                error_msg = f"Millis.ai API returned empty response with status {response.status_code}"
                logger.error(error_msg)
                return False, error_msg
        
        # Try to parse JSON response
        try:
            result = response.json()
            if isinstance(result, dict) and "success" in result:
                if not result.get("success", False):
                    error_msg = f"Millis.ai API returned success=false: {result}"
                    logger.error(error_msg)
                    return False, error_msg
            logger.info(f"Successfully stopped campaign {campaign_id}")
            return True, None
        except ValueError as e:
            if response.status_code == 200:
                logger.info(f"Successfully stopped campaign {campaign_id} (non-JSON response: {response_text[:100]})")
                return True, None
            else:
                error_msg = f"Millis.ai API returned invalid JSON: {response_text[:200]}"
                logger.error(error_msg)
                return False, error_msg
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error stopping campaign in Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in stop_campaign_millis: {e}"
        logger.error(error_msg)
        return False, error_msg


def delete_record_millis(campaign_id: str, phone: str) -> Tuple[bool, Optional[str]]:
    """
    Delete a record from a campaign in Millis.ai API.
    
    Args:
        campaign_id: Campaign ID (CID) in Millis.ai
        phone: Phone number to delete from campaign records
    
    Returns:
        Tuple of (success, error_message)
        - success: Whether operation succeeded
        - error_message: Error message if failed, None if succeeded
    """
    if not MILLIS_API_KEY:
        error_msg = "MILLIS_API_KEY not configured"
        logger.error(error_msg)
        return False, error_msg
    
    if not campaign_id:
        error_msg = "Campaign ID is required"
        logger.error(error_msg)
        return False, error_msg
    
    if not phone:
        error_msg = "Phone number is required"
        logger.error(error_msg)
        return False, error_msg
    
    try:
        url = f"{MILLIS_API_BASE_URL}/campaigns/{campaign_id}/records/{phone}"
        headers = {
            "authorization": MILLIS_API_KEY
        }
        
        logger.info(f"Deleting record {phone} from campaign {campaign_id} in Millis.ai")
        response = requests.delete(url, headers=headers, timeout=30)
        
        if response.status_code not in [200, 204]:
            error_msg = f"Millis.ai API returned status {response.status_code}: {response.text}"
            logger.error(error_msg)
            return False, error_msg
        
        # Handle empty response or non-JSON response
        response_text = response.text.strip()
        if not response_text:
            if response.status_code in [200, 204]:
                logger.info(f"Successfully deleted record {phone} from campaign {campaign_id} (empty response)")
                return True, None
            else:
                error_msg = f"Millis.ai API returned empty response with status {response.status_code}"
                logger.error(error_msg)
                return False, error_msg
        
        # Try to parse JSON response
        try:
            result = response.json()
            if isinstance(result, dict) and "success" in result:
                if not result.get("success", False):
                    error_msg = f"Millis.ai API returned success=false: {result}"
                    logger.error(error_msg)
                    return False, error_msg
            logger.info(f"Successfully deleted record {phone} from campaign {campaign_id}")
            return True, None
        except ValueError as e:
            if response.status_code in [200, 204]:
                logger.info(f"Successfully deleted record {phone} from campaign {campaign_id} (non-JSON response: {response_text[:100]})")
                return True, None
            else:
                error_msg = f"Millis.ai API returned invalid JSON: {response_text[:200]}"
                logger.error(error_msg)
                return False, error_msg
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Error deleting record in Millis.ai: {e}"
        logger.error(error_msg)
        return False, error_msg
    except Exception as e:
        error_msg = f"Unexpected error in delete_record_millis: {e}"
        logger.error(error_msg)
        return False, error_msg

