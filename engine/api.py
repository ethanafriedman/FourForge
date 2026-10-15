"""Small stateless API. No credentials, account data, or server-side game state."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel, Field

from .board import BLUE, Board
from .search import search

app = FastAPI(title="FourForge API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class AnalyzeRequest(BaseModel):
    board: list[list[int]] = Field(description="Six rows, bottom row first; seven cells per row")
    player: int = BLUE
    depth: int = Field(default=5, ge=1, le=7)
    strategy: str = "optimized"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "name": "FourForge"}


@app.post("/api/analyze")
def analyze(payload: AnalyzeRequest) -> dict:
    try:
        board = Board.from_rows(payload.board)
        # A legal game cannot have simultaneous winners. The terminal check
        # still handles a completed position without exploring further.
        result = search(board, player=payload.player, depth=payload.depth,
                        strategy=payload.strategy)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"column": result.column, "score": result.score,
            "principal_variation": list(result.principal_variation),
            "status": board.status(), "stats": result.stats.as_dict()}


# A fully playable, dependency-free web UI is bundled with the API.
WEB = Path(__file__).resolve().parent.parent / "web"

@app.get("/")
def home() -> FileResponse:
    return FileResponse(WEB / "index.html")

app.mount("/", StaticFiles(directory=WEB), name="web")
