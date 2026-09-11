// Rule-based topic tagger (tagger v1).
//
// Gives a paper up to MAX_TAGS topic ids from lib/topics.ts. It is plain
// pattern matching, so it runs in well under a millisecond per paper, needs
// no model, and every tag can be explained by the patterns that fired.
//
// Scoring, per topic:
//   +3 for each pattern found in the title
//   +1 for each pattern found in the abstract
//   +1 if the paper carries one of the topic's arXiv categories, but only
//      when at least one pattern matched (a category alone never tags)
// A topic needs a score of MIN_SCORE to count. One title hit is enough; one
// stray word in the abstract is not. Ties keep the taxonomy order.
//
// The embedding tagger (tagger v2, in the Python service) uses the same
// taxonomy and the same MAX_TAGS, so the two can be swapped or combined.

import type { Paper } from "@/lib/arxiv";
import { TOPICS, type Topic } from "@/lib/topics";

export const MAX_TAGS = 3;
export const MIN_SCORE = 2;
const TITLE_WEIGHT = 3;
const ABSTRACT_WEIGHT = 1;
const CATEGORY_WEIGHT = 1;

type Compiled = { topic: Topic; regexes: RegExp[]; cats: Set<string> };

// Compile every pattern once at module load. No "g" flag: a global regex
// keeps state between calls to test() and would give inconsistent results.
const compiled: Compiled[] = TOPICS.map((topic) => ({
  topic,
  regexes: topic.patterns.map((p) => new RegExp(p, "i")),
  cats: new Set(topic.cats),
}));

export type TopicScore = {
  id: string;
  score: number;
  /** Sources of the patterns that matched, for "why this tag" displays and the report script. */
  hits: string[];
};

type Taggable = Pick<Paper, "title" | "summary"> &
  Partial<Pick<Paper, "categories" | "primaryCategory">>;

/** Every topic that clears the threshold, best first. */
export function scoreTopics(paper: Taggable): TopicScore[] {
  const cats = new Set<string>(paper.categories ?? []);
  if (paper.primaryCategory) cats.add(paper.primaryCategory);

  const scored: TopicScore[] = [];
  for (const { topic, regexes, cats: topicCats } of compiled) {
    let score = 0;
    const hits: string[] = [];
    for (const re of regexes) {
      const inTitle = re.test(paper.title);
      const inAbstract = re.test(paper.summary);
      if (inTitle) score += TITLE_WEIGHT;
      if (inAbstract) score += ABSTRACT_WEIGHT;
      if (inTitle || inAbstract) hits.push(re.source);
    }
    if (hits.length > 0 && [...cats].some((c) => topicCats.has(c))) score += CATEGORY_WEIGHT;
    if (score >= MIN_SCORE) scored.push({ id: topic.id, score, hits });
  }
  // Array.prototype.sort is stable, so equal scores stay in taxonomy order.
  return scored.sort((a, b) => b.score - a.score);
}

/** The topic ids a paper is tagged with, best first, at most MAX_TAGS. */
export function tagPaper(paper: Taggable): string[] {
  return scoreTopics(paper)
    .slice(0, MAX_TAGS)
    .map((s) => s.id);
}

/** Convenience for the API route: the same papers with `tags` filled in. */
export function tagPapers<T extends Taggable>(papers: T[]): (T & { tags: string[] })[] {
  return papers.map((p) => ({ ...p, tags: tagPaper(p) }));
}
