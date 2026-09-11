"""
Neural recommender service for PaperScroll.

Drop-in upgrade for the in-browser TF-IDF recommender: same idea (profile
vector = mean of liked papers; rank candidates by cosine similarity), but the
vectors come from a sentence-transformer instead of word counts, so it captures
meaning, not just shared words.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

The model (~90 MB) downloads from Hugging Face on first run, then is cached.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    _model = SentenceTransformer(MODEL_NAME)  # loaded once at startup
    yield


app = FastAPI(title="PaperScroll Recommender", lifespan=lifespan)

# Allow the Next.js dev server (and your deployed frontend) to call this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Candidate(BaseModel):
    id: str
    text: str          # title + abstract
    recency: float = 0.0  # optional 0..1 freshness score from the client


class RecommendRequest(BaseModel):
    liked: list[str]          # texts of papers the user saved
    candidates: list[Candidate]
    recency_weight: float = 0.25


class Ranked(BaseModel):
    id: str
    score: float
    similarity: float


def embed(texts: list[str]) -> np.ndarray:
    assert _model is not None
    return _model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/recommend", response_model=list[Ranked])
def recommend(req: RecommendRequest) -> list[Ranked]:
    if not req.candidates:
        return []

    cand_vecs = embed([c.text for c in req.candidates])

    # Cold start: no likes yet -> rank by recency only.
    if not req.liked:
        ranked = [
            Ranked(id=c.id, score=c.recency, similarity=0.0)
            for c in req.candidates
        ]
        return sorted(ranked, key=lambda r: r.score, reverse=True)

    # Profile vector = normalized mean of the liked-paper embeddings.
    profile = embed(req.liked).mean(axis=0)
    profile /= np.linalg.norm(profile) + 1e-9

    sims = cand_vecs @ profile  # cosine, since everything is normalized
    w = req.recency_weight
    out = [
        Ranked(
            id=c.id,
            similarity=float(s),
            score=float((1 - w) * s + w * c.recency),
        )
        for c, s in zip(req.candidates, sims)
    ]
    return sorted(out, key=lambda r: r.score, reverse=True)


# ---------------------------------------------------------------------------
# Topic tagging (tagger v2)
#
# The rule-based tagger in lib/tagger.ts matches keywords. This endpoint does
# the same job by meaning: it embeds each topic's description once and each
# abstract once, takes the cosine similarity between them, and keeps the
# topics above a threshold, at most `max_tags` per paper. The taxonomy itself
# lives in lib/topics.ts and is sent with the request, so the service has no
# copy of it to keep in sync.


class TagTopic(BaseModel):
    id: str
    text: str  # label plus description


class TagCandidate(BaseModel):
    id: str
    text: str  # title plus abstract


class TagRequest(BaseModel):
    topics: list[TagTopic]
    candidates: list[TagCandidate]
    threshold: float = 0.3  # cosine similarity a topic needs to count
    max_tags: int = 3


class TagScore(BaseModel):
    id: str
    similarity: float


class TaggedPaper(BaseModel):
    id: str
    tags: list[TagScore]  # best first


_topic_cache: dict[str, np.ndarray] = {}


def embed_topics(topics: list[TagTopic]) -> np.ndarray:
    """Topic descriptions change rarely, so their embeddings are cached by text."""
    missing = [t.text for t in topics if t.text not in _topic_cache]
    if missing:
        for text, vec in zip(missing, embed(missing)):
            _topic_cache[text] = vec
    return np.stack([_topic_cache[t.text] for t in topics])


@app.post("/tag", response_model=list[TaggedPaper])
def tag(req: TagRequest) -> list[TaggedPaper]:
    if not req.candidates or not req.topics:
        return [TaggedPaper(id=c.id, tags=[]) for c in req.candidates]

    topic_vecs = embed_topics(req.topics)  # (topics, dim)
    cand_vecs = embed([c.text for c in req.candidates])  # (papers, dim)
    sims = cand_vecs @ topic_vecs.T  # cosine, everything is normalized

    out: list[TaggedPaper] = []
    for cand, row in zip(req.candidates, sims):
        order = np.argsort(-row)
        tags = [
            TagScore(id=req.topics[i].id, similarity=float(row[i]))
            for i in order[: req.max_tags]
            if row[i] >= req.threshold
        ]
        out.append(TaggedPaper(id=cand.id, tags=tags))
    return out
