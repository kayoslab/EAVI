// src/audio/structure/eventBus.ts
// Tiny typed emitter for audio structure events. The director, post
// modulators and layers subscribe; the timeline / live onset source emit.

import type { SectionLabel } from './analysis.ts';

export type AudioEvent =
  | { kind: 'beat'; t: number; index: number }
  | { kind: 'bar'; t: number; index: number }
  | { kind: 'section'; t: number; label: SectionLabel; index: number }
  | { kind: 'build-start'; t: number; strength: number }
  | { kind: 'drop:anticipate'; t: number; strength: number; secondsUntil: number }
  | { kind: 'drop'; t: number; strength: number }
  | { kind: 'breakdown'; t: number; strength: number }
  | { kind: 'fill'; t: number; strength: number }
  | { kind: 'trackStart'; trackPath: string }
  | { kind: 'trackEnd'; trackPath: string };

export type AudioEventKind = AudioEvent['kind'];

export type EventOfKind<E extends { kind: string }, K extends E['kind']> = Extract<E, { kind: K }>;

export type Listener<E> = (event: E) => void;

export interface EventBus<E extends { kind: string }> {
  /** Subscribe; returns an unsubscribe function. */
  on<K extends E['kind']>(kind: K, cb: Listener<EventOfKind<E, K>>): () => void;
  off<K extends E['kind']>(kind: K, cb: Listener<EventOfKind<E, K>>): void;
  emit(event: E): void;
  /** Remove every listener. */
  clear(): void;
}

export function createEventBus<E extends { kind: string } = AudioEvent>(): EventBus<E> {
  const listeners = new Map<string, Set<Listener<E>>>();

  return {
    on(kind, cb) {
      let set = listeners.get(kind);
      if (!set) {
        set = new Set();
        listeners.set(kind, set);
      }
      const fn = cb as unknown as Listener<E>;
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },

    off(kind, cb) {
      listeners.get(kind)?.delete(cb as unknown as Listener<E>);
    },

    emit(event) {
      const set = listeners.get(event.kind);
      if (!set || set.size === 0) return;
      // Copy so listeners may unsubscribe during dispatch.
      for (const fn of Array.from(set)) {
        fn(event);
      }
    },

    clear() {
      listeners.clear();
    },
  };
}
