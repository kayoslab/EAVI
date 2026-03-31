import { INFLUENCE_HINTS } from '../visual/hintRegistry';

let overlay: HTMLDivElement | null = null;

function showOverlay(): void {
  if (overlay) overlay.style.display = 'flex';
}

function hideOverlay(): void {
  if (overlay) overlay.style.display = 'none';
}

export function createInfoButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'eavi-info-btn';
  btn.setAttribute('aria-label', 'About this work');
  btn.textContent = 'ⓘ';
  btn.addEventListener('click', showOverlay);
  return btn;
}

export function createInfoOverlay(): HTMLDivElement {
  overlay = document.createElement('div');
  overlay.className = 'eavi-info-overlay';
  overlay.style.display = 'none';

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideOverlay();
  });

  const panel = document.createElement('div');
  panel.className = 'eavi-info-panel';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'eavi-info-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', hideOverlay);

  const p1 = document.createElement('p');
  p1.textContent =
    'EAVI is an ephemeral generative art installation. Each visit creates a unique, non-repeatable audiovisual scene.';

  const p2 = document.createElement('p');
  p2.textContent =
    'No data is stored. There are no cookies, no tracking, and nothing is saved or collected.';

  const hintList = document.createElement('ul');
  hintList.className = 'eavi-hints';
  for (const hint of INFLUENCE_HINTS) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.className = 'eavi-hint-category';
    strong.textContent = hint.category;
    li.appendChild(strong);
    li.appendChild(document.createTextNode(` ${hint.description}`));
    hintList.appendChild(li);
  }

  panel.appendChild(closeBtn);
  panel.appendChild(p1);
  panel.appendChild(p2);
  panel.appendChild(hintList);
  overlay.appendChild(panel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOverlay();
  });

  return overlay;
}
