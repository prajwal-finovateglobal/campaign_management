from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from Core.config import AUTH_USER, AUTH_PASSWORD
import secrets
import loguru
from datetime import datetime, timedelta

router = APIRouter()
logger = loguru.logger
security = HTTPBearer()

# In-memory session storage (in production, use Redis or database)
active_sessions: dict[str, dict] = {}

# Session expiry time (24 hours)
SESSION_EXPIRY_HOURS = 24


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    token: str | None = None


class VerifyTokenResponse(BaseModel):
    valid: bool
    message: str


def generate_session_token() -> str:
    """Generate a secure random session token"""
    return secrets.token_urlsafe(32)


def is_session_valid(token: str) -> bool:
    """Check if session token is valid and not expired"""
    if token not in active_sessions:
        return False
    
    session = active_sessions[token]
    expiry_time = session.get("expires_at")
    
    if expiry_time and datetime.now() > expiry_time:
        # Session expired, remove it
        del active_sessions[token]
        return False
    
    return True


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency to get current authenticated user.
    Raises HTTPException if token is invalid.
    """
    token = credentials.credentials
    
    if not is_session_valid(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return active_sessions[token]


@router.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest):
    """
    Login endpoint to authenticate user.
    Returns a session token on successful authentication.
    """
    logger.info(f"Login attempt for username: {request.username}")
    
    # Validate credentials
    if not AUTH_USER or not AUTH_PASSWORD:
        logger.error("Authentication credentials not configured in environment")
        logger.error(f"AUTH_USER is set: {bool(AUTH_USER)}, AUTH_PASSWORD is set: {bool(AUTH_PASSWORD)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication not configured"
        )
    
    # Debug logging (without exposing actual password)
    logger.info(f"Comparing username: '{request.username}' with configured: '{AUTH_USER}'")
    logger.info(f"Username match: {request.username == AUTH_USER}")
    logger.info(f"Password length match: {len(request.password) == len(AUTH_PASSWORD) if AUTH_PASSWORD else False}")
    
    # Strip whitespace from inputs for comparison
    username_clean = request.username.strip()
    password_clean = request.password.strip()
    auth_user_clean = AUTH_USER.strip() if AUTH_USER else ""
    auth_password_clean = AUTH_PASSWORD.strip() if AUTH_PASSWORD else ""
    
    if username_clean != auth_user_clean or password_clean != auth_password_clean:
        logger.warning(f"Failed login attempt for username: {request.username}")
        logger.warning(f"Expected username: '{auth_user_clean}', got: '{username_clean}'")
        logger.warning(f"Password lengths - Expected: {len(auth_password_clean) if auth_password_clean else 0}, Got: {len(password_clean)}")
        logger.warning(f"Username match: {username_clean == auth_user_clean}")
        logger.warning(f"Password match: {password_clean == auth_password_clean}")
        return LoginResponse(
            success=False,
            message="Invalid username or password",
            token=None
        )
    
    # Generate session token
    token = generate_session_token()
    expires_at = datetime.now() + timedelta(hours=SESSION_EXPIRY_HOURS)
    
    # Store session
    active_sessions[token] = {
        "username": username_clean,
        "created_at": datetime.now(),
        "expires_at": expires_at
    }
    
    logger.info(f"Successful login for username: {username_clean}, token generated")
    
    return LoginResponse(
        success=True,
        message="Login successful",
        token=token
    )


@router.post("/auth/logout")
def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Logout endpoint to invalidate session token.
    """
    token = credentials.credentials
    
    if token in active_sessions:
        del active_sessions[token]
        logger.info("User logged out successfully")
        return {"success": True, "message": "Logged out successfully"}
    
    return {"success": True, "message": "Already logged out"}


@router.get("/auth/verify", response_model=VerifyTokenResponse)
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify if a token is valid.
    """
    token = credentials.credentials
    
    if is_session_valid(token):
        return VerifyTokenResponse(
            valid=True,
            message="Token is valid"
        )
    else:
        return VerifyTokenResponse(
            valid=False,
            message="Token is invalid or expired"
        )


@router.get("/auth/me")
def get_current_user_info(user: dict = Depends(get_current_user)):
    """
    Get current authenticated user information.
    """
    return {
        "username": user.get("username"),
        "created_at": user.get("created_at").isoformat() if user.get("created_at") else None
    }


@router.get("/auth/debug")
def debug_auth_config():
    """
    Debug endpoint to check if auth credentials are loaded (without exposing actual values).
    Only available in development - should be removed or protected in production.
    """
    return {
        "auth_user_set": bool(AUTH_USER),
        "auth_password_set": bool(AUTH_PASSWORD),
        "auth_user_length": len(AUTH_USER) if AUTH_USER else 0,
        "auth_password_length": len(AUTH_PASSWORD) if AUTH_PASSWORD else 0,
        "auth_user_preview": AUTH_USER[:3] + "..." if AUTH_USER and len(AUTH_USER) > 3 else (AUTH_USER if AUTH_USER else "Not set")
    }
