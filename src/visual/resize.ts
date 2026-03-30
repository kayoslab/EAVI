export function attachResizeHandler(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): () => void {
  const onResize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
  }
}
