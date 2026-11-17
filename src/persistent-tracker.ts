import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Observation } from "./crossings.js";

type RecordState = { last: Observation; everAbove: boolean; lastSeenAt: string };
type Snapshot = { version: 1; tokens: Record<string, RecordState> };
export type DiscoveryEvent = Observation & { type: "crossed_up" | "first_seen_above"; previousMarketCapUsd?: number };

export class PersistentTracker {
  private tokens: Record<string, RecordState> = {};
  constructor(private readonly path: string, private readonly thresholdUsd = 300_000) {
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) throw new Error("Invalid threshold");
  }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.path, "utf8")) as Snapshot;
      if (raw.version !== 1 || !raw.tokens || typeof raw.tokens !== "object") throw new Error("Invalid snapshot");
      this.tokens = raw.tokens;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  observe(item: Observation): DiscoveryEvent | null {
    if (!item.mint || !Number.isFinite(item.marketCapUsd) || item.marketCapUsd <= 0) return null;
    const prior = this.tokens[item.mint];
    this.tokens[item.mint] = {
      last: item,
      everAbove: Boolean(prior?.everAbove || item.marketCapUsd >= this.thresholdUsd),
      lastSeenAt: item.observedAt
    };
    if (item.marketCapUsd < this.thresholdUsd || prior?.last.marketCapUsd >= this.thresholdUsd) return null;
    return prior
      ? { ...item, type: "crossed_up", previousMarketCapUsd: prior.last.marketCapUsd }
      : { ...item, type: "first_seen_above" };
  }
  trackedMints(): string[] { return Object.keys(this.tokens); }
  async save() {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    await writeFile(temp, JSON.stringify({ version: 1, tokens: this.tokens } satisfies Snapshot), "utf8");
    await rename(temp, this.path);
  }
}
