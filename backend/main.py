from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Configure logging FIRST (before any other imports that use logger)
from Core.logging_config import logger

from router.show_data import router as show_data_router
from router.csv import router as csv_router
from router.client import router as client_router
from router.phase import router as phase_router
from router.campaign import router as campaign_router
from router.chunk import router as chunk_router
from router.disposition import router as disposition_router
from router.translation import router as translation_router
from router.auth import router as auth_router, is_session_valid
from router.inbound import router as inbound_router
from router.table_config import router as table_config_router

# Import all models at startup to ensure SQLAlchemy can resolve relationships
# This must happen before any queries are executed
from content_size_limit_asgi import ContentSizeLimitMiddleware

MAX_CONTENT_SIZE = 1024 * 1024 * 500 # 500MB limit

app = FastAPI()
security = HTTPBearer(auto_error=False)

app.add_middleware(
    ContentSizeLimitMiddleware,
    max_content_size=MAX_CONTENT_SIZE
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Authentication middleware that protects all routes except /auth/* and root.
    """
    # Allow auth endpoints, root endpoint, and public shared disposition trees
    # Public endpoints: GET /disposition-tree/{share_id} for viewing shared trees (read-only)
    # Allow inbound router endpoints without authentication
    if (request.url.path.startswith("/auth") or 
        request.url.path.startswith("/incomming-calls") or 
        request.url.path.startswith("/table-config") or 
        request.url.path == "/" or 
        request.url.path == "/docs" or 
        request.url.path == "/openapi.json" or 
        request.url.path == "/redoc"):
        response = await call_next(request)
        return response
    
    # Allow public read-only access to shared disposition trees (GET only)
    # Pattern: /disposition-tree/share-* or any /disposition-tree/{id} with GET method
    if request.url.path.startswith("/disposition-tree/"):
        # Extract share_id from path
        path_parts = request.url.path.split("/")
        if len(path_parts) >= 3:
            share_id = path_parts[2]
            # Allow GET requests to shared trees (read-only, no auth required)
            # Only allow if it's a GET request (read-only)
            if request.method == "GET" and share_id.startswith("share-"):
                response = await call_next(request)
                return response
    
    # Check for Authorization header
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extract token
    try:
        scheme, token = auth_header.split(" ", 1)
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
    except ValueError:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid authorization header format"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Validate token
    if not is_session_valid(token):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid or expired session token"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Token is valid, proceed
    response = await call_next(request)
    return response


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (for ngrok sharing)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# Include auth router (login/logout endpoints are public)
app.include_router(auth_router)

# Include other routers (these will be protected by authentication middleware)
app.include_router(show_data_router)
app.include_router(csv_router)
app.include_router(client_router)
app.include_router(phase_router)
app.include_router(campaign_router)
app.include_router(chunk_router)
app.include_router(disposition_router)
app.include_router(translation_router)
app.include_router(inbound_router)
app.include_router(table_config_router, prefix="/table-config", tags=["table-config"])

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}
