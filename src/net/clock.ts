/** How many of the latest pings the server's clock is worked out from. */
export const CLOCK_SAMPLES = 5;

/** One ping: when it left and when its answer came, on this page's performance.now(), and the server's clock in it. */
export interface PingSample {
  sent: number;
  received: number;
  server: number;
}

/**
 * The server's clock as seen from here. Each ping tells how far apart the two clocks are, taking the server to have
 * read its clock halfway through the trip; the median of the last few keeps one slow trip from moving it.
 */
export class ClockSync {
  private readonly offsets: number[] = [];

  add(s: PingSample): void {
    this.offsets.push(s.server - (s.sent + (s.received - s.sent) / 2));
    if (this.offsets.length > CLOCK_SAMPLES) this.offsets.shift();
  }

  get count(): number {
    return this.offsets.length;
  }

  /** What to add to this page's clock to get the server's: the median of the samples, or 0 before the first. */
  offset(): number {
    const sorted = [...this.offsets].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length === 0) return 0;
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  toServer(local: number): number {
    return local + this.offset();
  }
}
