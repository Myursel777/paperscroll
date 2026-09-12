// Reading events: the raw material For You learns from.
//
// Every meaningful thing a reader does with a paper becomes one small event:
//   impression      the card came into view
//   dwell           the card left view; value is the milliseconds it was seen
//   expand          "Read full abstract" was tapped
//   read            "Read paper" or "PDF" was opened
//   save, unsave    the Save button
//   not_interested  the reader hid the paper from For You
//   tag_tap         a topic chip on a card was tapped
//
// An event carries the paper's topic tags at the time, so the interest
// profile (profile.ts) can be computed from events alone, without looking the
// paper up again. Nothing about the reader is stored: no address, no device,
// just paper id, type, tags, and time.
//
// Storage is the same pattern as saved papers (lib/useSaved.ts): the browser
// always keeps its own list in localStorage, and when a user is signed in the
// events are also queued for the account (table events) and flushed in order.
// The pure functions here are unit tested; the storage glue is in
// useReading.ts.

export const EVENT_TYPES = [
  "impression",
  "dwell",
  "expand",
  "read",
  "save",
  "unsave",
  "not_interested",
  "tag_tap",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type ReadingEvent = {
  type: EventType;
  paperId: string;
  /** Topic ids the paper carried when the event happened. */
  tags: string[];
  /** Milliseconds for dwell; null for everything else. */
  value: number | null;
  /** ISO time. */
  at: string;
};

/** Events older than this are dropped from the browser copy and never fetched from the account. */
export const KEEP_DAYS = 60;
/** The browser copy is capped so localStorage stays small (about 100 KB at most). */
export const MAX_LOCAL_EVENTS = 800;

const DAY_MS = 86_400_000;

/** One string that identifies an event, for de-duplication when lists are merged. */
export const eventKey = (e: ReadingEvent) => `${e.type}|${e.paperId}|${e.at}`;

/** Newest first. */
export function sortEvents(events: ReadingEvent[]): ReadingEvent[] {
  return [...events].sort((a, b) => b.at.localeCompare(a.at));
}

/** Drops events older than KEEP_DAYS and keeps the newest MAX_LOCAL_EVENTS, newest first. */
export function trimEvents(events: ReadingEvent[], now = Date.now()): ReadingEvent[] {
  const cutoff = new Date(now - KEEP_DAYS * DAY_MS).toISOString();
  return sortEvents(events.filter((e) => e.at >= cutoff)).slice(0, MAX_LOCAL_EVENTS);
}

/** The union of two lists with duplicates removed, newest first. */
export function mergeEvents(a: ReadingEvent[], b: ReadingEvent[]): ReadingEvent[] {
  const seen = new Set<string>();
  const out: ReadingEvent[] = [];
  for (const e of [...a, ...b]) {
    const k = eventKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return sortEvents(out);
}

/** Papers the reader marked "not interested". */
export function hiddenPaperIds(events: ReadingEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.type === "not_interested") out.add(e.paperId);
  return out;
}

/** Everything except the not_interested events for one paper (the undo). */
export function withoutHide(events: ReadingEvent[], paperId: string): ReadingEvent[] {
  return events.filter((e) => !(e.type === "not_interested" && e.paperId === paperId));
}

/** Builds an event. `tags` comes from the paper as shown, so the profile can use it later. */
export function makeEvent(
  type: EventType,
  paper: { id: string; tags?: string[] },
  value: number | null = null,
  at: string = new Date().toISOString(),
): ReadingEvent {
  return { type, paperId: paper.id, tags: paper.tags ?? [], value, at };
}
