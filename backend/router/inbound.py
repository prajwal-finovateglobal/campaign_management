from fastapi import APIRouter, HTTPException, Request, Query
import loguru
from schema.inboound import PrefetchIncommingCallsResponse
from typing import Optional
from repo.inbound import get_query_metadata
from database.dependencies import DB_DEPENDENCY
from datetime import datetime
router = APIRouter()
logger = loguru.logger
@router.get("/incomming-calls/prefetch", response_model=PrefetchIncommingCallsResponse)
def prefetch_incomming_calls(
    request: Request,
    session_id: str = Query(..., description="Unique session identifier"),
    agent_id: str = Query(..., description="ID of the agent handling the session"),
    from_number: Optional[str] = Query(None, alias="from", description="Caller’s phone number"),
    to_number: Optional[str] = Query(None, alias="to", description="Receiver’s phone number"),
    db: DB_DEPENDENCY = None,
    ):
    try:
        query_params = dict(request.query_params)
        req_metadata = {
            k: v for k, v in query_params.items()
            if k not in {"session_id", "agent_id", "from", "to"}
        }

        loguru.logger.info(f"Prefetch GET received | session_id={session_id} | agent_id={agent_id}| from_number={from_number} | to_number={to_number}")

        query = get_query_metadata(db, from_number)
        
        # Log the SQL query before execution with actual parameter value
        try:
            compiled_query = str(query.statement.compile(compile_kwargs={"literal_binds": False}))
            logger.info(f"Executing SQL query:\n{compiled_query}")
            # Log the actual value being used for the parameter :contact_to_1
            logger.info(f"Query parameter :contact_to_1 = '{from_number}'")
        except Exception as e:
            logger.warning(f"Could not compile query SQL: {e}")
            logger.info(f"Querying for contact_to (from_number): {from_number}")
        
        db_data = query.first()
        if not db_data:
            raise HTTPException(status_code=404, detail="No data found for the given from_number")
        
        # db_data is a tuple when using with_entities: (s_no, meta_data, contact_to, session_id, agent_id)
        s_no, query_metadata, contact_to, db_session_id, db_agent_id = db_data
        if not query_metadata:
            raise HTTPException(status_code=404, detail="No metadata found for the given from_number")
        
        
        logger.info(f"Prefetch GET received | session_id={session_id} | agent_id={agent_id} | metadata={query_metadata}")

        response_payload = {
            "session": {
                "session_id": session_id,
                "agent_id": agent_id,
                "from": from_number,
                "to": to_number
            },
            "metadata": {
                **req_metadata,
                **query_metadata,
            },
            "extra_prompt": "Welcome the Customer First"
        }

        return PrefetchIncommingCallsResponse(
            success=True, 
            message="Incomming calls prefetched successfully", 
            processed_at=datetime.now().isoformat(),
            data=response_payload
        )
    except Exception as e:
        logger.error(f"Error prefetching incomming calls: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))