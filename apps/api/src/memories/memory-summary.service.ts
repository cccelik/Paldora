import { Inject, Injectable } from '@nestjs/common';
import type { MemorySummaryView } from '@paldora/validation';
import { sql } from 'drizzle-orm';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { memoryCandidates } from './memory-candidates.js';

interface MonthCount extends Record<string, unknown> {
  readonly year: number;
  readonly month: number;
  readonly count: number;
}

/** Years newest first, and the chosen year's months newest first. */
export function summarize(
  counts: readonly MonthCount[],
  requestedYear: number | undefined,
): MemorySummaryView {
  const perYear = new Map<number, number>();
  for (const { year, count } of counts) {
    perYear.set(year, (perYear.get(year) ?? 0) + count);
  }
  const years = [...perYear]
    .map(([year, count]) => ({ year, count }))
    .sort((first, second) => second.year - first.year);
  const year = requestedYear ?? years[0]?.year ?? null;
  const months = counts
    .filter((row) => row.year === year)
    .map(({ month, count }) => ({ month, count }))
    .sort((first, second) => second.month - first.month);
  return { years, year, months };
}

/**
 * Counts over the same candidates as the Memories pages, bucketed by UTC
 * year and month, in one query. At most twelve rows per year with content,
 * so the result is bounded by the calendar rather than paginated.
 */
@Injectable()
export class MemorySummaryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly boxes: BoxPolicyService,
  ) {}

  public mine(viewerId: string, year?: number): Promise<MemorySummaryView> {
    return this.summary(viewerId, undefined, year);
  }

  /** A Box the viewer is not in right now answers BOX_NOT_FOUND. */
  public async ofBox(
    viewerId: string,
    boxId: string,
    year?: number,
  ): Promise<MemorySummaryView> {
    await this.boxes.membership(viewerId, boxId);
    return this.summary(viewerId, boxId, year);
  }

  private async summary(
    viewerId: string,
    boxId: string | undefined,
    year: number | undefined,
  ): Promise<MemorySummaryView> {
    const candidates = memoryCandidates({ viewerId, boxId, type: 'all' });
    const { rows } = await this.infrastructure.database.execute<MonthCount>(
      sql`select
          extract(year from c.at at time zone 'utc')::int as year,
          extract(month from c.at at time zone 'utc')::int as month,
          count(*)::int as count
        from (${candidates}) c
        group by 1, 2`,
    );
    return summarize(rows, year);
  }
}
