from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.income import router as income_router

app = FastAPI(title="Budget Spend Analyzer — Income Identification")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(income_router, prefix="/income", tags=["income"])
