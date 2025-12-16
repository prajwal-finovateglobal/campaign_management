"""
Authentication dependency for protecting API routes.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from router.auth import is_session_valid, active_sessions

security = HTTPBearer(auto_error=False)


def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Optional authentication dependency.
    Returns user info if authenticated, None otherwise.
    """
    if not credentials:
        return None
    
    token = credentials.credentials
    
    if not is_session_valid(token):
        return None
    
    return active_sessions.get(token)


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Required authentication dependency.
    Raises HTTPException if not authenticated.
    Use this to protect routes that require authentication.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    
    if not is_session_valid(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return active_sessions[token]

