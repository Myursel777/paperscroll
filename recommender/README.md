# PaperScroll Recommender (neural upgrade)

A small FastAPI service that ranks papers by **meaning** using
sentence-transformer embeddings, instead of the word-overlap TF-IDF that runs
in the browser by default.

## Run

```bash
cd recommender
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

First start downloads the `all-MiniLM-L6-v2` model (~90 MB) and caches it.

## API

`POST /recommend`
```json
{
  "liked": ["title + abstract of a saved paper", "..."],
  "candidates": [{ "id": "arxiv-id", "text": "title + abstract", "recency": 0.8 }],
  "recency_weight": 0.25
}
```
Returns the candidates sorted best-first with `score` and `similarity`.

## Wiring it into the frontend

In the Next app, point an env var at this service and call it from `Feed.tsx`
instead of the local `recommend()` when it's available:

```
# .env.local
NEXT_PUBLIC_RECOMMENDER_URL=http://localhost:8000
```

Keep the TF-IDF `recommend()` as the fallback when the service is unreachable —
that way the app always works, and the neural ranking is a progressive upgrade.

## Why this is the portfolio piece
- Real embedding model serving meaning-based similarity.
- Clean profile-vector + cosine ranking with a recency blend.
- Graceful degradation (neural when up, TF-IDF when not).
Document these choices — that reasoning is what reviewers actually read.
