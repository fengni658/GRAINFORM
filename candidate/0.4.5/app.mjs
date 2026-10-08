const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const VERSION = '0.4.5', WIDTH = 288, HEIGHT = 432, BLOCK = 24, GRAIN_R = .87;
const STORAGE = Object.freeze({ best: 'grainform:0.4.5:best', settings: 'grainform:0.4.5:settings' });
const PALETTES = { standard: ['', '#eac370', '#4fc0b3', '#d378a3', '#789fef'], contrast: ['', '#ffe07a', '#4df0b0', '#fc87b5', '#71a7ff'] };
const COLOR_NAMES = ['', '琥珀色', '海青色', '玫红色', '雾蓝色'];
const OCTAGON = Array.from({ length: 8 }, (_, i) => [GRAIN_R * Math.cos(Math.PI / 8 + i * Math.PI / 4), GRAIN_R * Math.sin(Math.PI / 8 + i * Math.PI / 4)]);
const query = new URLSearchParams(location.search);
const solver = query.get('solver') === 'adaptive' ? 'adaptive' : 'baseline';
const qaMode = query.has('qa');
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', { alpha: false });
const defaults = { sound: false, contrast: false, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches };
let settings = { ...defaults }, best = 0, savedBest = 0, storageAvailable = true, storageMessage = '', settingsDirty = false;
let ready = false, worker = null, failed = false, epoch = 0, sequence = 0;
let snapshot = { state: 'ready', bodies: [], active: null, next: null, score: 0, level: 1, cleared: 0, pieces: 0, time: 0, tick: 0, events: [] };
let diagnostics = {}, renderFrame = null, drawCount = 0, lastDrawMs = 0, maxDrawMs = 0;
let pauseRequested = false, pauseReason = '', lastEventId = 0;
let pending = new Map(), holdTimers = new Map(), keyHeld = new Map(), pointerHeld = new Map();
let audio = null, lastAnnounced = '', lastDiagnosticsAt = 0, roundBestSuppressedUntil = -1;
let focusedDialogTrigger = null, lastUIState = null;

function number(value) { return Math.max(0, Number(value) || 0); }
function format(value) { return Math.round(number(value)).toLocaleString('zh-CN'); }
function setText(selector, value) { for (const node of $$(selector)) if (node.textContent !== String(value)) node.textContent = value; }
function announce(text) { if (text !== lastAnnounced) { $('announcer').textContent = text; lastAnnounced = text; } }
function loadStorage() {
  try {
    const rawBest = localStorage.getItem(STORAGE.best);
    if (rawBest !== null && Number.isSafeInteger(Number(rawBest)) && Number(rawBest) >= 0) best = savedBest = Number(rawBest);
    const rawSettings = localStorage.getItem(STORAGE.settings);
    if (rawSettings) { try { const value = JSON.parse(rawSettings); for (const key of Object.keys(defaults)) if (typeof value?.[key] === 'boolean') settings[key] = value[key]; } catch { storageMessage = '设置格式异常，已使用默认设置。'; } }
    // A successful read is not proof that this browser can persist a write.
  } catch { storageAvailable = false; storageMessage = '无法读取本地存储；设置与最高分只在本次页面中保留。'; }
}
function markStorageFailure(message) { storageAvailable = false; storageMessage = message; updateStorageUI(); }
function updateStorageUI() {
  setText('[data-best]', format(best));
  setText('[data-best-label]', storageAvailable && best <= savedBest ? '本地最高' : '本次最高');
  $('storageFooter').textContent = storageAvailable && !settingsDirty && best <= savedBest ? '设置与最高分仅保存在此浏览器' : '部分更改未保存 · 未保存内容仅本页保留';
  $('storageNotice').textContent = (storageMessage || '设置与最高分仅保存在当前浏览器，刷新不保留本局。') + (settingsDirty ? ' 部分设置尚未保存。' : '');
}
function saveSettings() {
  try {
    const encoded = JSON.stringify(settings);
    localStorage.setItem(STORAGE.settings, encoded);
    if (localStorage.getItem(STORAGE.settings) !== encoded) throw new Error('write could not be verified');
    settingsDirty = false; storageAvailable = true; storageMessage = '设置已保存在当前浏览器；本局进度不保存。';
  } catch { settingsDirty = true; markStorageFailure('设置未能保存；当前页面仍会使用所选设置，刷新后可能丢失。'); }
  updateStorageUI();
}
function recordScore() {
  const score = Math.floor(number(snapshot.score));
  if (score <= best || score <= roundBestSuppressedUntil) return;
  best = score;
  try {
    // Merge a known higher cross-tab value without overwriting it.
    const current = Number(localStorage.getItem(STORAGE.best));
    if (Number.isSafeInteger(current) && current >= 0) best = Math.max(best, current);
    localStorage.setItem(STORAGE.best, String(best));
    if (localStorage.getItem(STORAGE.best) !== String(best)) throw new Error('write could not be verified');
    savedBest = best; storageAvailable = true; storageMessage = '';
  } catch { markStorageFailure('最高分未能保存；本页显示本次最高，刷新后可能丢失。'); }
  updateStorageUI();
}
function resetBest() {
  // Keep both the displayed and known persisted score intact if verification fails.
  let previousBest = best, previousSaved = savedBest;
  try {
    const current = Number(localStorage.getItem(STORAGE.best));
    if (Number.isSafeInteger(current) && current >= 0) { previousBest = Math.max(best, current); previousSaved = current; }
    localStorage.setItem(STORAGE.best, '0');
    if (localStorage.getItem(STORAGE.best) !== '0') throw new Error('write could not be verified');
    best = savedBest = 0; roundBestSuppressedUntil = number(snapshot.score);
    storageAvailable = true; storageMessage = '本地最高分已清除。当前这一局需超过清除时的得分，才会再次记为最高分。';
    $('resetStatus').textContent = '本地最高分已清除。'; $('resetConfirm').hidden = true;
  } catch {
    best = previousBest; savedBest = previousSaved;
    markStorageFailure('未能确认清除，已保留已知最高分。可稍后重试。');
    $('resetStatus').textContent = '未能确认清除，已保留已知记录。';
  }
  $('resetStatus').hidden = false; updateStorageUI(); announce($('resetStatus').textContent); if ($('resetConfirm').hidden) $('resetBest').focus();
}
function applySettings() {
  $('soundToggle').checked = settings.sound; $('contrastToggle').checked = settings.contrast; $('motionToggle').checked = !settings.motion;
  document.documentElement.classList.toggle('reduce-motion', !settings.motion);
  requestDraw();
}
function sound(kind) {
  if (!settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const t = audio.currentTime, osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(kind === 'clear' ? 523 : kind === 'over' ? 165 : 240, t);
    osc.frequency.exponentialRampToValueAtTime(kind === 'clear' ? 784 : kind === 'over' ? 82 : 110, t + .09);
    gain.gain.setValueAtTime(.055, t); gain.gain.exponentialRampToValueAtTime(.001, t + .13);
    osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .14);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  } catch { /* Audio is optional; a browser denial never interrupts play. */ }
}
function color(value) { return typeof value === 'string' ? value : PALETTES[settings.contrast ? 'contrast' : 'standard'][value] || PALETTES.standard[1]; }
function octagon(context, x, y) {
  context.moveTo(x + OCTAGON[0][0], y + OCTAGON[0][1]);
  for (let i = 1; i < 8; i++) context.lineTo(x + OCTAGON[i][0], y + OCTAGON[i][1]);
  context.closePath();
}
function piece(context, active) {
  if (!active?.shape) return;
  context.fillStyle = color(active.color); context.beginPath();
  for (const [bx, by] of active.shape) for (let gy = 0; gy < 13; gy++) for (let gx = 0; gx < 13; gx++) {
    octagon(context, active.x + bx * BLOCK + (gx + .5) * BLOCK / 13, active.y + by * BLOCK + (gy + .5) * BLOCK / 13);
  }
  context.fill();
}
function drawNext(target) {
  const context = target.getContext('2d'); context.clearRect(0, 0, target.width, target.height);
  const next = snapshot.next; if (!next?.shape?.length) return;
  const xs = next.shape.map(p => p[0]), ys = next.shape.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = (Math.max(...xs) - minX + 1) * BLOCK, height = (Math.max(...ys) - minY + 1) * BLOCK;
  const scale = Math.min((target.width - 24) / width, (target.height - 20) / height, 1.5);
  context.save(); context.translate((target.width - width * scale) / 2, (target.height - height * scale) / 2); context.scale(scale, scale);
  piece(context, { ...next, x: -minX * BLOCK, y: -minY * BLOCK }); context.restore();
}
function draw() {
  renderFrame = null;
  const begun = performance.now();
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 3);
  const w = Math.max(WIDTH, Math.round(rect.width * dpr)), h = Math.round(w * HEIGHT / WIDTH);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.fillStyle = '#0d1315'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Subtle guide marks are UI, not synthetic grains or a cached particle texture.
  ctx.fillStyle = '#182322';
  for (let y = 36; y < 420; y += 24) { ctx.fillRect(12, y, 4, .7); ctx.fillRect(272, y, 4, .7); }
  ctx.fillStyle = '#2c3a36'; ctx.fillRect(24, 0, 4, 424); ctx.fillRect(260, 0, 4, 424); ctx.fillRect(24, 420, 240, 4);
  ctx.fillStyle = '#586753'; ctx.fillRect(27, 0, 1, 420); ctx.fillRect(260, 0, 1, 420); ctx.fillRect(28, 420, 232, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(28, 0, 232, 420); ctx.clip();
  // Path batching only groups equal colors. Every physical grain gets its own
  // eight vertices at its actual position; no image, sprite, outline, or blur.
  const bodies = snapshot.bodies || [];
  for (let c = 1; c <= 4; c++) {
    ctx.fillStyle = color(c); ctx.beginPath();
    for (const body of bodies) if (body.color === c) octagon(ctx, body.x, body.y);
    ctx.fill();
  }
  piece(ctx, snapshot.active); ctx.restore();
  drawNext($('nextCanvas')); drawNext($('nextMobile'));
  lastDrawMs = performance.now() - begun; maxDrawMs = Math.max(maxDrawMs, lastDrawMs); drawCount++;
}
function requestDraw() { if (renderFrame === null && !document.hidden) renderFrame = requestAnimationFrame(draw); }
function activeInputAllowed() { return ready && !failed && snapshot.state === 'playing' && !pauseRequested && !pendingName('restart') && !pendingName('resume') && !$$('dialog[open]').length && !document.hidden; }
function pendingName(name) { return [...pending.values()].some(p => p.name === name); }
function updateInputStatus() {
  const count = pending.size;
  $('inputStatus').textContent = failed ? '模拟已停止' : pauseRequested ? '正在请求暂停…' : count ? `处理中 · ${count}` : snapshot.state === 'playing' ? '操作就绪' : snapshot.state === 'paused' ? '已暂停' : snapshot.state === 'over' ? '本局结束' : '等待开始';
}
function updateUI() {
  const state = snapshot.state;
  document.body.dataset.state = state;
  setText('[data-score]', format(snapshot.score)); setText('[data-level]', String(number(snapshot.level) || 1).padStart(2, '0'));
  setText('[data-cleared]', format(snapshot.rawCleared ?? snapshot.cleared)); setText('[data-pieces]', format(snapshot.pieces));
  $('levelProgress').style.width = Math.max(5, Math.min(100, (number(snapshot.cleared) % 1800) / 1800 * 100)) + '%';
  $('nextColor').textContent = COLOR_NAMES[snapshot.next?.color] || '等待开始';
  $('stateLabel').textContent = failed ? '模拟异常' : pauseRequested ? '正在暂停' : ({ ready: ready ? '准备就绪' : '正在准备', playing: '流动中', paused: '已暂停', over: '本局结束' }[state] || state);
  $('pauseButton').disabled = !ready || failed || state === 'ready' || state === 'over' || pauseRequested;
  $('pauseButton').textContent = state === 'paused' ? '▷' : 'Ⅱ';
  $('pauseButton').setAttribute('aria-label', state === 'paused' ? '继续游戏' : '暂停游戏');
  $('startButton').disabled = !ready || failed || pendingName('start'); $('startButton').textContent = ready ? pendingName('start') ? '正在开始…' : '开始游戏  ↵' : '正在准备…';
  const panel = failed ? 'errorPanel' : pauseRequested || state === 'paused' ? 'pausePanel' : state === 'over' ? 'overPanel' : state === 'ready' ? 'homePanel' : null;
  $('overlay').hidden = !panel;
  for (const id of ['homePanel', 'pausePanel', 'overPanel', 'errorPanel']) $(id).hidden = id !== panel;
  $('overlay').setAttribute('aria-busy', String(pauseRequested));
  $('overlay').setAttribute('aria-labelledby', panel === 'pausePanel' ? 'pauseTitle' : panel === 'overPanel' ? 'overTitle' : panel === 'errorPanel' ? 'errorTitle' : 'overlayTitle');
  $('pauseReason').textContent = pauseRequested ? '正在等待当前物理步结束，暂停尚未确认。' : pauseReason || '游戏已暂停，沙粒和游戏时间都停在这里。';
  $('resumeButton').disabled = pauseRequested || pendingName('resume') || document.hidden;
  $('restartButton').disabled = pauseRequested;
  for (const button of $$('#touchControls button')) button.disabled = !activeInputAllowed();
  $('endScore').textContent = format(snapshot.score);
  $('endRecord').textContent = number(snapshot.score) >= best && best > 0 ? storageAvailable && savedBest >= best ? '刷新本地最高分，记录已保存。' : '刷新本次最高分，但未能保存。' : '每一局，都有不同的流向。';
  $('endDetails').textContent = `落下 ${format(snapshot.pieces)} 块 · 消除 ${format(snapshot.rawCleared ?? snapshot.cleared)} 粒 · 游戏时间 ${Math.floor(number(snapshot.time))} 秒`;
  updateInputStatus();
  if (diagnostics.slowdown && state === 'playing') {
    $('clockNotice').textContent = `实验慢速 · 游戏时间约 ${(diagnostics.recentRate * 100).toFixed(0)}% 实时。物理不跳步，操作在当前计算结束后生效。`;
    $('clockNotice').classList.add('slow');
  } else {
    $('clockNotice').textContent = `独立实验试玩 · ${solver === 'adaptive' ? '早停候选核' : '基准物理核'}。负载高时游戏时间会放慢，物理不跳步。`;
    $('clockNotice').classList.remove('slow');
  }
  if (lastUIState !== state) {
    if (state === 'paused') announce('游戏已暂停');
    if (state === 'over') announce(`本局结束，得分 ${format(snapshot.score)}`);
    if (state !== 'playing') releaseAll();
    // Only move focus for game-driven transitions; keep dialogs and pointer input intact.
    if (state === 'over' && !$$('dialog[open]').length) $('againButton').focus({ preventScroll: true });
    lastUIState = state;
  }
  if (qaMode && performance.now() - lastDiagnosticsAt > 400) {
    $('qaOutput').textContent = JSON.stringify(readQA(), null, 2); lastDiagnosticsAt = performance.now();
  }
}
function handleEvents() {
  for (const event of snapshot.events || []) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    if (event.type === 'land' || event.type === 'clear' || event.type === 'over') sound(event.type);
    if (event.type === 'clear') announce(`消除 ${format(event.rawCount ?? event.count)} 粒沙，当前得分 ${format(snapshot.score)}`);
  }
}
function sendCommand(name, value, { repeat = false } = {}) {
  if (!worker || !ready || failed) return Promise.resolve({ applied: false, blocked: 'not-ready' });
  const input = ['left', 'right', 'move', 'rotate', 'drop', 'down', 'softDrop'].includes(name);
  if (input && !activeInputAllowed()) return Promise.resolve({ applied: false, blocked: 'not-playing' });
  // Held buttons never fill the worker queue. Direct input is bounded too.
  if ((repeat && pending.size > 0) || (input && pending.size >= 6)) {
    updateInputStatus(); return Promise.resolve({ applied: false, blocked: 'queue-busy' });
  }
  if (['start', 'pause', 'resume', 'restart'].includes(name) && pendingName(name)) return Promise.resolve({ applied: false, blocked: 'already-pending' });
  if (name === 'restart') releaseAll();
  const id = ++sequence;
  const promise = new Promise((resolve) => pending.set(id, { name, resolve, sentAt: performance.now() }));
  worker.postMessage({ type: 'command', id, name, value, epoch });
  updateUI(); return promise;
}
function pause(reason = '') {
  releaseAll();
  if (snapshot.state !== 'playing' && !pendingName('start') && !pendingName('resume')) return Promise.resolve({ applied: false });
  pauseReason = reason; pauseRequested = true;
  const promise = sendCommand('pause'); updateUI(); return promise;
}
function resume() { if (document.hidden || pauseRequested) return Promise.resolve({ applied: false }); pauseReason = ''; return sendCommand('resume'); }
function togglePause() { return snapshot.state === 'paused' ? resume() : pause(); }
function seed() {
  if (query.has('seed')) return Number(query.get('seed')) >>> 0;
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Date.now() >>> 0; }
}
function start() {
  if (settings.sound) sound('land');
  $('gameCanvas').focus({ preventScroll: true });
  return snapshot.state === 'ready' ? sendCommand('start') : sendCommand('restart', { seed: seed() });
}
function fail(message) {
  failed = true; ready = false; pauseRequested = false; releaseAll();
  for (const item of pending.values()) item.resolve({ applied: false, error: message });
  pending.clear(); $('errorText').textContent = `游戏模拟已停止：${message}。请重新加载再试。`;
  updateUI(); announce('游戏模拟已停止，请重新加载再试。');
}
function setupWorker() {
  try {
    worker = new Worker(new URL('./simulation-worker.mjs', import.meta.url), { type: 'module', name: 'grainform-0.4.5-physics' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') { ready = true; updateUI(); return; }
      if (data.type === 'snapshot') {
        if (data.epoch < epoch) return;
        if (data.epoch !== epoch) { epoch = data.epoch; lastEventId = 0; roundBestSuppressedUntil = -1; }
        snapshot = data.snapshot; diagnostics = data.diagnostics || {};
        if (snapshot.state === 'paused' || snapshot.state === 'over') pauseRequested = false;
        if (snapshot.state !== 'playing') releaseAll();
        recordScore(); handleEvents(); updateUI(); requestDraw(); return;
      }
      if (data.type === 'ack') {
        const item = pending.get(data.id);
        pending.delete(data.id);
        if (item?.name === 'pause') { pauseRequested = false; if (data.state === 'paused') snapshot = { ...snapshot, state: 'paused' }; }
        item?.resolve(data); updateUI();
        if (data.error) fail(data.error); return;
      }
      if (data.type === 'fatal') { fail(data.message); return; }
      if (data.type === 'visibility' && data.hidden && data.state === 'paused') { pauseRequested = false; snapshot = { ...snapshot, state: 'paused' }; updateUI(); }
    };
    worker.onerror = (event) => { event.preventDefault(); fail(event.message || '工作线程未能加载'); };
    worker.onmessageerror = () => fail('工作线程消息无法读取');
    worker.postMessage({ type: 'init', seed: seed(), solver });
    worker.postMessage({ type: 'visibility', hidden: document.hidden });
  } catch (error) { fail(error.message || '此浏览器不支持模块工作线程'); }
}
function beginHold(token, action, button) {
  endHold(token);
  if (!activeInputAllowed()) return;
  button?.classList.add('held'); sendCommand(action);
  if (!['left', 'right', 'down'].includes(action)) return;
  const entry = { timer: null, button };
  const repeat = () => { if (!holdTimers.has(token) || !activeInputAllowed()) { endHold(token); return; } sendCommand(action, undefined, { repeat: true }); entry.timer = setTimeout(repeat, action === 'down' ? 70 : 85); };
  entry.timer = setTimeout(repeat, action === 'down' ? 120 : 220); holdTimers.set(token, entry);
}
function endHold(token) { const entry = holdTimers.get(token); if (entry) { clearTimeout(entry.timer); entry.button?.classList.remove('held'); holdTimers.delete(token); } }
function releaseAll() {
  for (const token of [...holdTimers.keys()]) endHold(token);
  keyHeld.clear(); pointerHeld.clear();
  for (const button of $$('#touchControls button')) button.classList.remove('held');
}
function openDialog(id, trigger) {
  if ($$('dialog[open]').length) return;
  focusedDialogTrigger = trigger || document.activeElement;
  pause('查看玩法或设置后，点击继续游戏。');
  $(id).showModal(); updateUI();
}
function closeDialog(dialog) {
  dialog.close();
  if (dialog.id === 'settingsDialog') { $('resetConfirm').hidden = true; $('resetStatus').hidden = true; }
  focusedDialogTrigger?.focus?.({ preventScroll: true }); focusedDialogTrigger = null; updateUI();
}
const keys = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'rotate', KeyW: 'rotate', ArrowDown: 'down', KeyS: 'down', Space: 'drop' };
window.addEventListener('keydown', (event) => {
  if ($$('dialog[open]').length || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (!event.repeat) togglePause(); return; }
  if (event.code === 'Enter' && (snapshot.state === 'ready' || snapshot.state === 'over')) { event.preventDefault(); if (!event.repeat) start(); return; }
  const action = keys[event.code]; if (!action) return;
  if (event.code === 'Space' && event.target?.tagName === 'BUTTON') return;
  event.preventDefault(); if (event.repeat || keyHeld.has(event.code)) return;
  keyHeld.set(event.code, action); beginHold(`key:${event.code}`, action);
});
window.addEventListener('keyup', (event) => { if (keys[event.code]) { endHold(`key:${event.code}`); keyHeld.delete(event.code); } });
for (const button of $$('#touchControls button')) {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !activeInputAllowed()) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); pointerHeld.set(event.pointerId, button);
    beginHold(`pointer:${event.pointerId}`, button.dataset.action, button);
  });
  const release = (event) => { endHold(`pointer:${event.pointerId}`); pointerHeld.delete(event.pointerId); button.classList.remove('held'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  // Keyboard and assistive-technology activation emits a zero-detail click.
  button.addEventListener('click', (event) => { if (event.detail === 0) sendCommand(button.dataset.action); });
}
window.addEventListener('blur', () => { releaseAll(); if (snapshot.state === 'playing') pause('窗口失去焦点，已暂停。'); });
document.addEventListener('visibilitychange', () => {
  releaseAll();
  if (document.hidden) { pause('离开页面后已暂停，返回时不会自动继续。'); if (renderFrame !== null) { cancelAnimationFrame(renderFrame); renderFrame = null; } }
  worker?.postMessage({ type: 'visibility', hidden: document.hidden });
  if (!document.hidden) { requestDraw(); updateUI(); }
});
window.addEventListener('pagehide', () => { releaseAll(); worker?.postMessage({ type: 'visibility', hidden: true }); });
window.addEventListener('pageshow', () => { worker?.postMessage({ type: 'visibility', hidden: document.hidden }); requestDraw(); });
window.addEventListener('resize', requestDraw);
$('startButton').addEventListener('click', start); $('againButton').addEventListener('click', start);
$('pauseButton').addEventListener('click', togglePause); $('resumeButton').addEventListener('click', () => { resume(); canvas.focus({ preventScroll: true }); });
$('restartButton').addEventListener('click', (event) => openDialog('restartDialog', event.currentTarget));
$('cancelRestart').addEventListener('click', () => { closeDialog($('restartDialog')); });
$('confirmRestart').addEventListener('click', () => { closeDialog($('restartDialog')); pauseReason = ''; sendCommand('restart', { seed: seed() }); canvas.focus({ preventScroll: true }); });
$('retryButton').addEventListener('click', () => location.reload());
for (const id of ['howButton', 'helpButton', 'headerHelp']) $(id).addEventListener('click', (event) => openDialog('helpDialog', event.currentTarget));
$('settingsButton').addEventListener('click', (event) => openDialog('settingsDialog', event.currentTarget));
for (const button of $$('[data-close]')) button.addEventListener('click', () => closeDialog(button.closest('dialog')));
for (const dialog of $$('dialog')) dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(dialog); });
for (const [id, key] of [['soundToggle', 'sound'], ['contrastToggle', 'contrast'], ['motionToggle', 'motion']]) $(id).addEventListener('change', () => { settings[key] = key === 'motion' ? !$(id).checked : $(id).checked; applySettings(); saveSettings(); if (key === 'sound' && settings.sound) sound('clear'); });
$('resetBest').addEventListener('click', () => { $('resetConfirm').hidden = false; $('resetStatus').hidden = true; $('cancelReset').focus(); });
$('cancelReset').addEventListener('click', () => { $('resetConfirm').hidden = true; $('resetBest').focus(); });
$('confirmReset').addEventListener('click', resetBest);
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE.best) { try { const value = Number(localStorage.getItem(STORAGE.best)); if (Number.isSafeInteger(value) && value >= 0) { best = savedBest = value; roundBestSuppressedUntil = number(snapshot.score); storageMessage = '最高分已与此浏览器的其他页面同步。'; storageAvailable = true; updateStorageUI(); } } catch { markStorageFailure('无法确认其他页面的最高分，保留本页已知记录。'); } }
  if (event.key === STORAGE.settings && event.newValue) { try { const value = JSON.parse(event.newValue); for (const key of Object.keys(defaults)) if (typeof value?.[key] === 'boolean') settings[key] = value[key]; applySettings(); } catch {} }
});
function readQA() {
  return { version: VERSION, ready, failed, state: snapshot.state, pauseRequested, seed: query.get('seed'), solver,
    tick: snapshot.tick, time: snapshot.time, score: snapshot.score, pieces: snapshot.pieces, grains: snapshot.bodies?.length || 0,
    active: snapshot.active, pendingInputs: pending.size, heldInputs: holdTimers.size, pendingRenderFrames: renderFrame === null ? 0 : 1,
    drawCount, lastDrawMs, maxDrawMs, worker: { ...diagnostics }, storage: { available: storageAvailable, best, savedBest, settingsDirty, message: storageMessage }, settings: { ...settings } };
}
const qa = Object.freeze({
  version: VERSION, get ready() { return ready; }, get snapshot() { return structuredClone(snapshot); }, get diagnostics() { return readQA(); },
  command: (name, value) => name === 'pause' ? pause() : name === 'resume' ? resume() : sendCommand(name, value),
  read: readQA, storageKeys: STORAGE, redraw: requestDraw,
  waitFor: (predicate, timeoutMs = 10000) => new Promise((resolve, reject) => {
    const begin = performance.now();
    const check = () => { const state = readQA(); if (predicate(state)) resolve(state); else if (failed) reject(new Error('Simulation failed')); else if (performance.now() - begin > timeoutMs) reject(new Error('QA wait timed out')); else setTimeout(check, 30); }; check();
  })
});
window.grainformQA = qa; window.grainform = qa; window.__grainform = qa;
$('qaDiagnostics').hidden = !qaMode;
loadStorage(); applySettings(); updateStorageUI(); updateUI(); setupWorker(); requestDraw();
