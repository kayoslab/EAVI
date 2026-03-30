import { vi } from 'vitest'

function createMockContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    canvas: document.createElement('canvas'),
  } as unknown as CanvasRenderingContext2D
}

HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
  const ctx = createMockContext()
  ctx.canvas = this
  return ctx
}) as unknown as typeof HTMLCanvasElement.prototype.getContext
