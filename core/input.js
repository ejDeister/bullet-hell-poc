// core/input.js
// Keyboard + mouse input. WASD move, mouse aim, click fire, Shift sprint,
// Space dash, Q/E cycle items, F use item, ~ dev menu, 1-4 weapon select.

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.pressedThisFrame = new Set();
    this._onDevMenu = null;
    this._bind(target);
  }

  _bind(target) {
    window.addEventListener('keydown', (e) => {
      // Backtick/tilde toggles dev menu and must not type into focused inputs.
      if (e.key === '`' || e.key === '~') {
        if (this._onDevMenu) this._onDevMenu();
        e.preventDefault();
        return;
      }
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressedThisFrame.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDevMenu(fn) { this._onDevMenu = fn; }

  has(k) { return this.keys.has(k); }
  pressed(k) { return this.pressedThisFrame.has(k); }

  // Normalized move vector from WASD.
  moveVector() {
    let x = 0, y = 0;
    if (this.keys.has('w')) y -= 1;
    if (this.keys.has('s')) y += 1;
    if (this.keys.has('a')) x -= 1;
    if (this.keys.has('d')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }

  // Call at end of each frame.
  endFrame() {
    this.pressedThisFrame.clear();
  }
}
