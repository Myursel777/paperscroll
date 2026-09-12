"""
Nightly job, step 2: add a sentence embedding to every paper.

    python recommender/embed.py papers.json papers-embedded.json

Reads the file written by scripts/nightly/fetch.ts, embeds each paper's title
and abstract with the same model the /recommend and /tag endpoints use
(all-MiniLM-L6-v2, 384 dimensions, unit length), and writes the same file back
with an `embedding` on every paper.

The vectors are unit length, so cosine similarity is a dot product; that is
what the `nearest_papers` function in the database computes.

This runs on a plain GitHub Actions runner with the CPU build of torch. If it
fails or is skipped, step 3 still uploads the papers with no embedding: the
store then serves the topic and recency parts of For You, and similarity
falls back to the TF-IDF engine in the browser.
"""
from __future__ import annotations

import json
import sys

from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH = 64


def paper_text(p: dict) -> str:
    """Title twice then the abstract, the same weighting lib/recommender.ts uses."""
    return f"{p.get('title', '')} {p.get('title', '')} {p.get('summary', '')}"


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else "papers.json"
    dst = sys.argv[2] if len(sys.argv) > 2 else src

    with open(src, encoding="utf-8") as fh:
        store = json.load(fh)
    papers = store.get("papers", [])
    if not papers:
        print("nothing to embed")
        return 1

    print(f"loading {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    vectors = model.encode(
        [paper_text(p) for p in papers],
        batch_size=BATCH,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    for paper, vec in zip(papers, vectors):
        # Six decimals is far below the noise floor of the model and keeps the
        # file about a third of the size.
        paper["embedding"] = [round(float(x), 6) for x in vec]

    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(store, fh)
    print(f"embedded {len(papers)} papers ({len(vectors[0])} dimensions) into {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
