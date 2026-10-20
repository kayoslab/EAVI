// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createEventBus, type AudioEvent } from '../../../src/audio/structure/eventBus';

describe('eventBus', () => {
  it('delivers events only to listeners of that kind', () => {
    const bus = createEventBus<AudioEvent>();
    const beat = vi.fn();
    const drop = vi.fn();
    bus.on('beat', beat);
    bus.on('drop', drop);
    bus.emit({ kind: 'beat', t: 1, index: 0 });
    expect(beat).toHaveBeenCalledWith({ kind: 'beat', t: 1, index: 0 });
    expect(drop).not.toHaveBeenCalled();
  });

  it('off and the returned unsubscribe both remove listeners', () => {
    const bus = createEventBus<AudioEvent>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('beat', a);
    bus.on('beat', b);
    offA();
    bus.off('beat', b);
    bus.emit({ kind: 'beat', t: 0, index: 0 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('tolerates unsubscribing during dispatch', () => {
    const bus = createEventBus<AudioEvent>();
    const second = vi.fn();
    const first = vi.fn(() => bus.off('beat', second));
    bus.on('beat', first);
    bus.on('beat', second);
    expect(() => bus.emit({ kind: 'beat', t: 0, index: 0 })).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
    bus.emit({ kind: 'beat', t: 1, index: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('emitting without listeners is a no-op', () => {
    const bus = createEventBus<AudioEvent>();
    expect(() => bus.emit({ kind: 'trackStart', trackPath: '/audio/x.mp3' })).not.toThrow();
  });

  it('clear removes everything', () => {
    const bus = createEventBus<AudioEvent>();
    const fn = vi.fn();
    bus.on('bar', fn);
    bus.clear();
    bus.emit({ kind: 'bar', t: 0, index: 0 });
    expect(fn).not.toHaveBeenCalled();
  });
});
