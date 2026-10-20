/**
 * Static page for browsers without WebGPU. Nothing else boots: no canvas, no audio, no pointer tracking.
 */
export function renderUnsupported(container: HTMLElement, reason?: string): void {
  container.replaceChildren();
  const root = document.createElement('div');
  root.className = 'eavi-unsupported';
  root.setAttribute('role', 'main');

  const title = document.createElement('h1');
  title.textContent = 'EAVI';

  const sub = document.createElement('p');
  sub.className = 'eavi-unsupported-sub';
  sub.textContent = '// ephemeral audiovisual installation';

  const msg = document.createElement('p');
  msg.textContent = 'This piece renders on the GPU through WebGPU, and this browser does not expose it.';

  const hint = document.createElement('p');
  hint.textContent = 'It runs in current Chrome, Edge, Safari 26 and Firefox on the desktop, and in Chrome for Android and Safari on iOS 26.';

  const status = document.createElement('p');
  status.className = 'eavi-unsupported-status';
  status.textContent = reason ? `> ${reason}` : '> webgpu: unavailable';

  const privacy = document.createElement('p');
  privacy.className = 'eavi-unsupported-small';
  privacy.textContent = 'Nothing was stored, sent, or tracked while this page loaded.';

  root.append(title, sub, msg, hint, status, privacy);
  container.appendChild(root);
}
