export type Observation = { mint: string; symbol: string; marketCapUsd: number; observedAt: string; poolAddress: string };
export type EventType = "crossed_up" | "first_seen_above";
export type CrossingEvent = Observation & { type: EventType; previousMarketCapUsd?: number };
export class CrossingTracker {
  private previous = new Map<string, Observation>();
  constructor(private readonly thresholdUsd = 300_000) {
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) throw new Error("Invalid threshold");
  }
  observe(item: Observation): CrossingEvent | null {
    if (!item.mint || !Number.isFinite(item.marketCapUsd) || item.marketCapUsd < 0) return null;
    const old = this.previous.get(item.mint);
    this.previous.set(item.mint, item);
    if (item.marketCapUsd < this.thresholdUsd) return null;
    if (!old) return { ...item, type: "first_seen_above" };
    if (old.marketCapUsd < this.thresholdUsd) {
      return { ...item, type: "crossed_up", previousMarketCapUsd: old.marketCapUsd };
    }
    return null;
  }
}
