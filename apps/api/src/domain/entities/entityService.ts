/**
 * Entity registry and global search (§15, §16).
 *
 * Search is deliberately a domain service rather than a database query helper:
 * it ranks across heterogeneous kinds, and that ranking is policy worth
 * testing. Exact-id matches always outrank label matches, because a user who
 * types "BTCUSDT" wants that asset, not a wallet whose label happens to
 * contain it.
 *
 * The `SearchAction` shape is the seam for a future command palette — the
 * architecture §15 asks for, without building commands that do not exist yet.
 */

import type { EntityKind, EntityRef } from "@nexus/contracts";
import { entityKey } from "@nexus/contracts";

export interface EntityRecord extends EntityRef {
  metadata: Record<string, unknown> | null;
  updatedAt: number;
}

export interface EntityRepository {
  upsert(entity: EntityRecord): Promise<void>;
  find(kind: EntityKind, id: string): Promise<EntityRecord | null>;
  search(term: string, limit: number): Promise<EntityRecord[]>;
  listByKind(kind: EntityKind, limit: number): Promise<EntityRecord[]>;
}

export interface SearchResult {
  entity: EntityRef;
  /** 0-100. Exposed so the UI can group rather than guess at ordering. */
  score: number;
  matchedOn: "ID" | "LABEL";
}

export function rankSearchResults(term: string, entities: EntityRecord[], limit: number): SearchResult[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const scored: SearchResult[] = [];
  for (const entity of entities) {
    const id = entity.id.toLowerCase();
    const label = entity.label.toLowerCase();

    let score = 0;
    let matchedOn: "ID" | "LABEL" = "LABEL";

    if (id === needle) { score = 100; matchedOn = "ID"; }
    else if (label === needle) { score = 95; matchedOn = "LABEL"; }
    else if (id.startsWith(needle)) { score = 85; matchedOn = "ID"; }
    else if (label.startsWith(needle)) { score = 75; matchedOn = "LABEL"; }
    else if (id.includes(needle)) { score = 60; matchedOn = "ID"; }
    else if (label.includes(needle)) { score = 50; matchedOn = "LABEL"; }
    else continue;

    scored.push({ entity: { kind: entity.kind, id: entity.id, label: entity.label }, score, matchedOn });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entity.label.localeCompare(b.entity.label))
    .slice(0, limit);
}

export class EntityService {
  private readonly repo: EntityRepository;

  constructor(repo: EntityRepository) {
    this.repo = repo;
  }

  async search(term: string, limit = 20): Promise<SearchResult[]> {
    if (term.trim().length < 1) return [];
    const candidates = await this.repo.search(term.trim(), limit * 4);
    return rankSearchResults(term, candidates, limit);
  }

  async resolve(kind: EntityKind, id: string): Promise<EntityRef | null> {
    const found = await this.repo.find(kind, id);
    return found ? { kind: found.kind, id: found.id, label: found.label } : null;
  }

  async register(entity: EntityRef, metadata: Record<string, unknown> | null, now: number): Promise<void> {
    await this.repo.upsert({ ...entity, metadata, updatedAt: now });
  }

  static key(entity: EntityRef): string {
    return entityKey(entity);
  }
}
