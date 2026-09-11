"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormMessage } from "@/components/auth/ui";
import { fieldForCategory } from "@/lib/arxiv";
import { useCollections } from "@/lib/saved/collections";
import { topicById } from "@/lib/topics";
import { useSaved } from "@/lib/useSaved";

type Sort = "newest" | "oldest" | "title";
const UNFILED = "__unfiled__";

// The library: every saved paper, searchable and sortable, filed into
// collections. Signed-in only (see middleware.ts); the drawer in the feed is
// the quick view for everyone.
export function Library() {
  const { saved, remove, setCollection, syncing } = useSaved();
  const { collections, create, rename, remove: removeCollection } = useCollections();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState<string | null>(null); // collection id, UNFILED, or null for all
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = saved.filter((p) => {
      if (filter === UNFILED && p.collectionId) return false;
      if (filter && filter !== UNFILED && p.collectionId !== filter) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.authors.some((a) => a.toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.savedAt.localeCompare(b.savedAt) : b.savedAt.localeCompare(a.savedAt),
    );
    return list;
  }, [saved, query, sort, filter]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const activeCollection = collections.find((c) => c.id === filter);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
        Back to the feed
      </Link>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">Library</h1>
          <p className="mt-2 text-muted">
            {saved.length} saved {saved.length === 1 ? "paper" : "papers"}
            {syncing ? ", syncing…" : ""}
          </p>
        </div>
        <Link href="/account" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Account
        </Link>
      </div>

      {/* Collections */}
      <section aria-label="Collections" className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: null, label: `All (${saved.length})` },
            { id: UNFILED, label: `Unfiled (${saved.filter((p) => !p.collectionId).length})` },
            ...collections.map((c) => ({ id: c.id, label: `${c.name} (${saved.filter((p) => p.collectionId === c.id).length})` })),
          ].map(({ id, label }) => {
            const on = filter === id;
            return (
              <button
                key={id ?? "all"}
                onClick={() => setFilter(id)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${on ? "border-ink bg-ink text-paper" : "border-line text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            );
          })}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              void run(async () => {
                const c = await create(newName);
                setNewName("");
                setFilter(c.id);
              });
            }}
            className="flex items-center gap-2"
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection"
              aria-label="New collection name"
              maxLength={60}
              className="w-40 rounded-full border border-line bg-paper px-3 py-1 text-sm outline-none focus:border-ink"
            />
            <button type="submit" className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:border-ink">
              Add
            </button>
          </form>
        </div>

        {activeCollection && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            <button
              onClick={() => {
                const name = window.prompt("Rename collection", activeCollection.name);
                if (name && name.trim() && name.trim() !== activeCollection.name) void run(() => rename(activeCollection.id, name));
              }}
              className="text-muted underline underline-offset-4 hover:text-ink"
            >
              Rename
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete the collection "${activeCollection.name}"? The papers in it stay saved.`)) {
                  void run(async () => {
                    await removeCollection(activeCollection.id);
                    setFilter(null);
                  });
                }
              }}
              className="text-muted underline underline-offset-4 hover:text-ink"
            >
              Delete collection
            </button>
          </div>
        )}
      </section>

      {/* Search and sort */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles and authors"
          aria-label="Search saved papers"
          className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="mt-4">
          <FormMessage tone="error">{error}</FormMessage>
        </div>
      )}

      {/* Papers */}
      {shown.length === 0 ? (
        <p className="mt-16 text-center text-muted">
          {saved.length === 0 ? "Nothing saved yet. Tap Save on a paper in the feed to keep it here." : "No saved papers match."}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line">
          {shown.map((p) => {
            const field = fieldForCategory(p.primaryCategory);
            return (
              <li key={p.id} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: field.accent }}>
                      {field.label}
                    </span>
                    <a href={p.id} target="_blank" rel="noreferrer" className="mt-1 block font-display text-lg font-semibold leading-snug hover:underline">
                      {p.title}
                    </a>
                    <p className="mt-1 text-sm text-muted">
                      {p.authors.slice(0, 3).join(", ")}
                      {p.authors.length > 3 ? " et al." : ""} · saved {new Date(p.savedAt).toLocaleDateString()}
                    </p>
                    {p.tags.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                        {p.tags.map((t) => topicById(t)?.label ?? t).map((label) => (
                          <span key={label} className="rounded-full border border-line px-2 py-0.5">
                            {label}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <label className="flex items-center gap-2 text-muted">
                      <span className="sr-only">Collection for {p.title}</span>
                      <select
                        value={p.collectionId ?? ""}
                        onChange={(e) => void run(() => setCollection(p.id, e.target.value || null))}
                        className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink outline-none focus:border-ink"
                      >
                        <option value="">Unfiled</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {p.pdfLink && (
                      <a href={p.pdfLink} target="_blank" rel="noreferrer" aria-label={`Open PDF of ${p.title}`} className="text-muted underline underline-offset-4 hover:text-ink">
                        PDF
                      </a>
                    )}
                    <button onClick={() => remove(p.id)} aria-label={`Remove ${p.title} from saved`} className="text-muted underline underline-offset-4 hover:text-ink">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
