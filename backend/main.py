from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from router.show_data import router as show_data_router
from router.csv import router as csv_router
from router.client import router as client_router
from router.phase import router as phase_router
from router.campaign import router as campaign_router

# Import all models at startup to ensure SQLAlchemy can resolve relationships
# This must happen before any queries are executed
import models  # noqa: F401 - Ensures all models are registered with SQLAlchemy

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

app.include_router(show_data_router)
app.include_router(csv_router)
app.include_router(client_router)
app.include_router(phase_router)
app.include_router(campaign_router)

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}
