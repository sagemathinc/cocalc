/*
LICENSE: MIT

This is a slight fork  of

https://github.com/sapphiredev/utilities/tree/main/packages/event-iterator

because upstream is slightly broken and what it actually does doesn't
agree with the docs.  I can see why.   Upstream would capture ['arg1','arg2']]
for an event emitter doing this

    emitter.emit('foo', 'arg1', 'arg2')

But for our application we only want 'arg1'.  I thus added a map option,
which makes it easy to do what we want.
*/

import type { EventEmitter } from "node:events";

/**
 * A filter for an EventIterator.
 */
export type EventIteratorFilter<V> = (value: V) => boolean;

/**
 * Options to be passed to an EventIterator.
 */
export interface EventIteratorOptions<V> {
  /**
   * The filter.
   */
  filter?: EventIteratorFilter<V>;

  // maps the array of args emitted by the event emitter a V
  map?: (args: any[]) => V;

  /**
   * The timeout in ms before ending the EventIterator.
   */
  idle?: number;

  /**
   * The limit of events that pass the filter to iterate.
   */
  limit?: number;

  // called when iterator ends -- use to do cleanup.
  onEnd?: (iter?: EventIterator<V>) => void;

  // Specifies the number of events to queue between iterations of the <AsyncIterator> returned.
  maxQueue?: number;
}

/**
 * An EventIterator, used for asynchronously iterating over received values.
 */
export class EventIterator<V extends unknown>
  implements AsyncIterableIterator<V>
{
  /**
   * The emitter to listen to.
   */
  public readonly emitter: EventEmitter;

  /**
   * The event the event iterator is listening for to receive values from.
   */
  public readonly event: string;

  /**
   * The filter used to filter out values.
   */
  public filter: EventIteratorFilter<V>;

  public map;

  /**
   * Whether or not the EventIterator has ended.
   */
  #ended = false;

  private onEnd?: (iter?: EventIterator<V>) => void;

  /**
   * The amount of idle time in ms before moving on.
   */
  readonly #idle?: number;

  /**
   * The queue of received values.
   */
  #queue: V[] = [];

  private err: any = undefined;

  /**
   * The amount of events that have passed the filter.
   */
  #passed = 0;

  /**
   * The limit before ending the EventIterator.
   */
  readonly #limit: number;

  readonly #maxQueue: number;

  /**
   * The timer to track when this will idle out.
   */
  #idleTimer: NodeJS.Timeout | undefined | null = null;

  /**
   * The push handler with context bound to the instance.
   */
  readonly #push: (this: EventIterator<V>, ...value: unknown[]) => void;

  /**
   * @param emitter The event emitter to listen to.
   * @param event The event we're listening for to receives values from.
   * @param options Any extra options.
   */
  public constructor(
    emitter: EventEmitter,
    event: string,
    options: EventIteratorOptions<V> = {},
  ) {
    this.emitter = emitter;
    this.event = event;
    this.map = options.map ?? ((args) => args);
    this.#limit = options.limit ?? Infinity;
    this.#maxQueue = options.maxQueue ?? Infinity;
    this.#idle = options.idle;
    this.filter = options.filter ?? ((): boolean => true);
    this.onEnd = options.onEnd;

    // This timer is to idle out on lack of valid responses
    if (this.#idle) {
      // NOTE: this same code is in next in case when we can't use refresh
      this.#idleTimer = setTimeout(this.end.bind(this), this.#idle);
    }
    this.#push = this.push.bind(this);
    const maxListeners = this.emitter.getMaxListeners();
    if (maxListeners !== 0) this.emitter.setMaxListeners(maxListeners + 1);

    this.emitter.on(this.event, this.#push);
  }

  /**
   * Whether or not the EventIterator has ended.
   */
  public get ended(): boolean {
    return this.#ended;
  }

  /**
   * Ends the EventIterator.
   */
  public end(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#queue = [];

    this.emitter.off(this.event, this.#push);
    const maxListeners = this.emitter.getMaxListeners();
    if (maxListeners !== 0) {
      this.emitter.setMaxListeners(maxListeners - 1);
    }
    this.onEnd?.(this);
  }
  // aliases to match usage in NATS and CoCalc.
  close = this.end;
  stop = this.end;

  drain(): void {
    // just immediately end
    this.end();
    // [ ] TODO: for compat.  I'm not sure what this should be
    // or if it matters...
    // console.log("WARNING: TODO -- event-iterator drain not implemented");
  }

  /**
   * The next value that's received from the EventEmitter.
   */
  public async next(): Promise<IteratorResult<V>> {
    if (this.err) {
      const err = this.err;
      delete this.err;
      this.end();
      throw err;
    }
    // If there are elements in the queue, return an undone response:
    if (this.#queue.length) {
      const value = this.#queue.shift()!;
      if (!this.filter(value)) {
        return this.next();
      }
      if (++this.#passed >= this.#limit) {
        this.end();
      }
      if (this.#idleTimer) {
        if (this.#idleTimer.refresh != null) {
          this.#idleTimer.refresh();
        } else {
          clearTimeout(this.#idleTimer);
          this.#idleTimer = setTimeout(this.end.bind(this), this.#idle);
        }
      }

      return { done: false, value };
    }

    // If the iterator ended, clean-up timer and return a done response:
    if (this.#ended) {
      if (this.#idleTimer) clearTimeout(this.#idleTimer);
      return { done: true, value: undefined as never };
    }

    // Listen for a new element from the emitter:
    return new Promise<IteratorResult<V>>((resolve) => {
      let idleTimer: NodeJS.Timeout | undefined | null = null;

      // If there is an idle time set, we will create a temporary timer,
      // which will cause the iterator to end if no new elements are received:
      if (this.#idle) {
        idleTimer = setTimeout(() => {
          this.end();
          resolve(this.next());
        }, this.#idle);
      }

      // Once it has received at least one value, we will clear the timer (if defined),
      // and resolve with the new value:
      this.emitter.once(this.event, () => {
        if (idleTimer) clearTimeout(idleTimer);
        resolve(this.next());
      });
    });
  }

  /**
   * Handles what happens when you break or return from a loop.
   */
  public return(): Promise<IteratorResult<V>> {
    this.end();
    return Promise.resolve({ done: true, value: undefined as never });
  }

  public throw(err): Promise<IteratorResult<V>> {
    this.err = err;
    // fake event to trigger handling of err
    this.emitter.emit(this.event);
    this.end();
    return Promise.resolve({ done: true, value: undefined as never });
  }

  /**
   * The symbol allowing EventIterators to be used in for-await-of loops.
   */
  public [Symbol.asyncIterator](): AsyncIterableIterator<V> {
    return this;
  }

  /**
   * Pushes a value into the queue.
   */
  protected push(...args): void {
    try {
      const value = this.map(args);
      this.#queue.push(value);
      while (this.#queue.length > this.#maxQueue && this.#queue.length > 0) {
        this.#queue.shift();
      }
    } catch (err) {
      this.err = err;
      // fake event to trigger handling of err
      this.emitter.emit(this.event);
    }
  }

  public queueSize(): number {
    return this.#queue.length;
  }
}
