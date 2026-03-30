export function initScene(container: HTMLElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  return { canvas, ctx }
}
