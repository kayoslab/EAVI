import type { AudioPlayer } from '../audio/player';

const MUTED_LABEL = 'Unmute audio';
const UNMUTED_LABEL = 'Mute audio';
const MUTED_TEXT = '\u{1F507}';
const UNMUTED_TEXT = '\u{1F50A}';

function update(btn: HTMLButtonElement, muted: boolean): void {
  btn.setAttribute('aria-label', muted ? MUTED_LABEL : UNMUTED_LABEL);
  btn.textContent = muted ? MUTED_TEXT : UNMUTED_TEXT;
}

export function createMuteButton(player: AudioPlayer): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'eavi-mute-btn';
  update(btn, player.muted);

  btn.addEventListener('click', () => {
    const next = !player.muted;
    player.setMuted(next);
    update(btn, next);
  });

  return btn;
}
