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

Point the Next app at this service with an env var and restart `npm run dev`:

```
# .env.local
NEXT_PUBLIC_RECOMMENDER_URL=http://localhost:8000
```

`lib/neuralRecommender.ts` then sends the saved papers (or the seed paper for
"Similar") and the candidate pool to `POST /recommend` and shows the returned
order. If the service is not reachable or does not answer within four seconds,
the app falls back to the local TF-IDF `recommend()`, so it always works and
the neural ranking is a progressive upgrade.

## Why this is the portfolio piece
- Real embedding model serving meaning-based similarity.
- Clean profile-vector + cosine ranking with a recency blend.
- Graceful degradation (neural when up, TF-IDF when not).
Document these choices — that reasoning is what reviewers actually read.
