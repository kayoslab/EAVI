export function startLoop(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const frame = () => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
