/* 송도고 동아리 OX 퀴즈 — 진행자 · 참가자 공용 스크립트 */
(() => {
  'use strict';

  /* ── 문제 (정답·해설은 진행자 화면에서만 불러와 공개 시점에 전송합니다) ── */
  const QUIZ = [
    { club: '컴퓨터부', q: '송도고는 2026 전국자율주행경진대회에서\n대상을 차지하였다.' },
    { club: 'LSL', q: 'STR은 DNA에서 짧은 연쇄 반복서열로\n사람마다 차이가 크게 나서 범죄 수사에서 많이 활용된다.\n이때 STR 부위를 많이 복제한 후에\n전기영동을 이용하면 반복 서열을 알 수 있다.' },
    { club: 'CELL', q: '마리모는 물속에서 자라는 이끼의 한 종류이다.' },
    { club: '과학봉사동아리 SCV', q: '말랑이를 만들 때 PVA 고분자 사슬들이\n서로 연결되어 말랑말랑한 성질을 나타내도록 하는 데\n직접 관여하는 재료는 베이킹소다이다.' },
    { club: 'CHEMIST', q: '수소연료전지 안에서 (-)극의 수소 이온(H+)은\n도선을 따라 (+)극으로 이동한다.' },
    { club: '물리부 Potential', q: '국제단위계 기본단위의 정의 중\n길이의 기본 단위는 미터(기호: m)이다.' },
    { club: '과실동아리', q: '물은 입사각에 따라 편광판 역할을 할 수 있다.' },
    { club: '서베이', q: 'R에서 mean(c(2, 4, 6))을 실행하면\n결과는 4이다.' },
    { club: 'World Link Media', q: '유엔 지속가능발전목표(UN-SDGs) 15번은\n지속가능한 도시와 공동체를 다루는 목표이다.' },
    { club: 'SYNERGY', q: '플라스틱 부품을 구부렸을 때,\n무지개 줄무늬가 가장 촘촘하게 몰려 있는 곳이\n가장 안전한 부위이다.' },
  ];
  const N = QUIZ.length;
  const COUNT_SEC = 15;
  const PHASES = ['lobby', 'question', 'countdown', 'locked', 'reveal', 'final'];
  const CHARS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐯', '🦁', '🐸', '🐵', '🐧', '🐥', '🦄', '🐲', '🐙', '🦖', '🐳', '🦉', '🐹', '🐨', '🤖', '👻', '👽', '🎃'];
  const EMOTES = ['👍', '😂', '❤️', '😱', '🎉'];
  const ROOT = 'sdox26/r7Kq2mXv';
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  const X_MIN = 0.04, X_MAX = 0.96, Y_MIN = 0.3, Y_MAX = 0.86, SPEED = 0.95;

  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r3 = v => Math.round(v * 1000) / 1000;
  const pad2 = n => String(n).padStart(2, '0');
  const rid = n => Array.from({ length: n }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[(Math.random() * 32) | 0]).join('');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('sdox.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sdox.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const IS_HOST = new URLSearchParams(location.search).has('host');
  const app = $('#app');
  app.dataset.role = IS_HOST ? 'host' : 'player';

  /* ───────────── 소리: 잔잔한 BGM(실시간 합성) + 효과음 ───────────── */
  const Sound = (() => {
    let ctx, master, bgm, sfx, wet, noiseBuf, nextBar = 0, bar = 0;
    let muted = LS.get('muted', false);
    const BGM_VOL = 0.6, BAR = (60 / 64) * 4;
    const mtof = m => 440 * 2 ** ((m - 69) / 12);
    const CHORDS = [[53, 57, 60, 64], [55, 59, 62, 64], [52, 55, 59, 62], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64], [48, 55, 59, 64], [48, 55, 60, 62]];
    const PENTA = [72, 74, 76, 79, 81, 84];

    function voice(dest, freq, t, o) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || 'sine'; osc.frequency.value = freq; if (o.det) osc.detune.value = o.det;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.vol, t + o.a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.a + o.d);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + o.a + o.d + 0.05);
      return g;
    }
    function noise(t, dur, vol, type, f0, f1) {
      const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      src.buffer = noiseBuf; src.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(sfx); src.start(t); src.stop(t + dur + 0.05);
    }
    function playBar(t, i) {
      const ch = CHORDS[i % CHORDS.length], e = BAR / 8, pat = [0, 2, 1, 3, 2, 3, 1, 2];
      ch.forEach(m => {                                             // 패드
        voice(bgm, mtof(m), t, { vol: 0.05, a: 1.4, d: BAR + 1.2 });
        voice(bgm, mtof(m), t, { type: 'triangle', vol: 0.016, a: 1.6, d: BAR + 1, det: 7 });
      });
      voice(bgm, mtof(ch[0] - 12), t, { vol: 0.11, a: 0.05, d: BAR * 0.9 });   // 베이스
      for (let s = 0; s < 8; s++) {                                 // 아르페지오
        if (s && Math.random() < 0.28) continue;
        const m = ch[pat[s] % ch.length] + 12, tt = t + s * e + Math.random() * 0.012, v = 0.05 + Math.random() * 0.03;
        voice(bgm, mtof(m), tt, { type: 'triangle', vol: v, a: 0.006, d: 1.3 }).connect(wet);
        voice(bgm, mtof(m) * 2, tt, { vol: v * 0.25, a: 0.004, d: 0.5 });
      }
      if (i % 2 === 1) {                                            // 가끔 멜로디
        const n = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) voice(bgm, mtof(PENTA[(Math.random() * PENTA.length) | 0]), t + e * (2 + k * 3), { vol: 0.045, a: 0.02, d: 2.4 }).connect(wet);
      }
    }
    function schedule() { if (!ctx) return; while (nextBar < ctx.currentTime + 1.6) { playBar(nextBar, bar++); nextBar += BAR; } }
    function start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      bgm = ctx.createGain(); bgm.gain.value = 0.0001; bgm.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      const delay = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      delay.delayTime.value = BAR / 16 * 3; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1600;
      wet = ctx.createGain(); wet.gain.value = 0.5;
      wet.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(bgm);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      bgm.gain.setTargetAtTime(BGM_VOL, ctx.currentTime, 1.2);
      nextBar = ctx.currentTime + 0.15;
      setInterval(schedule, 250); schedule();
    }
    const T = () => ctx.currentTime + 0.02;
    const fx = fn => (...a) => { if (ctx && ctx.state === 'running') { try { fn(...a); } catch (e) {} } };
    return {
      start,
      get muted() { return muted; },
      toggle() { muted = !muted; LS.set('muted', muted); if (ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); return muted; },
      duck(on) { if (ctx) bgm.gain.setTargetAtTime(on ? BGM_VOL * 0.28 : BGM_VOL, ctx.currentTime, 0.5); },
      tick: fx(n => {
        const t = T();
        if (n <= 5) { voice(sfx, 1568, t, { type: 'triangle', vol: 0.5, a: 0.004, d: 0.24 }); voice(sfx, 784, t, { vol: 0.3, a: 0.004, d: 0.26 }); }
        else { voice(sfx, n % 2 ? 1175 : 988, t, { type: 'triangle', vol: 0.34, a: 0.002, d: 0.1 }); voice(sfx, 196, t, { vol: 0.22, a: 0.002, d: 0.08 }); }
      }),
      go: fx(() => { const t = T(); [784, 1175, 1568].forEach((f, i) => voice(sfx, f, t + i * 0.12, { type: 'triangle', vol: 0.38, a: 0.005, d: i === 2 ? 0.6 : 0.16 })); }),
      timeup: fx(() => {
        const t = T();
        [0, 0.2].forEach(o => voice(sfx, 932, t + o, { type: 'square', vol: 0.15, a: 0.005, d: 0.15 }));
        voice(sfx, 622, t + 0.4, { type: 'square', vol: 0.17, a: 0.005, d: 0.9 }); voice(sfx, 311, t + 0.4, { type: 'sawtooth', vol: 0.12, a: 0.005, d: 0.9 });
      }),
      roll: fx(dur => { const t = T(), st = 0.055; for (let x = 0; x < dur; x += st) noise(t + x, st * 0.95, 0.1 + 0.3 * (x / dur), 'bandpass', 1800); }),
      tada: fx(() => {
        const t = T();
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { voice(sfx, f, t + i * 0.07, { type: 'triangle', vol: 0.28, a: 0.005, d: 1.5 }); voice(sfx, f * 2, t + i * 0.07, { vol: 0.09, a: 0.005, d: 1 }); });
        noise(t, 0.9, 0.16, 'highpass', 6000);
      }),
      swoosh: fx(() => noise(T(), 0.4, 0.14, 'bandpass', 400, 2600)),
      pop: fx(() => { const t = T(); voice(sfx, 660, t, { vol: 0.2, a: 0.004, d: 0.12 }); voice(sfx, 990, t + 0.07, { vol: 0.2, a: 0.004, d: 0.16 }); }),
      fanfare: fx(() => { const t = T(); [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => voice(sfx, f, t + i * 0.13, { type: 'triangle', vol: 0.3, a: 0.005, d: i === 6 ? 1.8 : 0.3 })); noise(t + 0.78, 1.2, 0.14, 'highpass', 5000); }),
    };
  })();

  /* ───────────── 색종이 ───────────── */
  const FX = (() => {
    const cv = $('#fx'), c = cv.getContext('2d'); let parts = [], running = false, W = 0, H = 0, D = 1;
    const size = () => { D = Math.min(2, window.devicePixelRatio || 1); W = cv.width = innerWidth * D; H = cv.height = innerHeight * D; };
    addEventListener('resize', size); size();
    function step() {
      c.clearRect(0, 0, W, H);
      parts = parts.filter(p => p.life > 0 && p.y < H + 40);
      for (const p of parts) {
        p.vy += 0.26 * D; p.vx *= 0.986; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.009;
        c.save(); c.globalAlpha = Math.min(1, p.life * 2.5); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.c; c.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9); c.restore();
      }
      if (parts.length) requestAnimationFrame(step); else { running = false; c.clearRect(0, 0, W, H); }
    }
    return {
      burst(x, y, colors, n) {
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (3 + Math.random() * 11) * D; parts.push({ x: x * W, y: y * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 7 * D, r: (3 + Math.random() * 5) * D, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 }); }
        if (!running) { running = true; requestAnimationFrame(step); }
      },
    };
  })();

  /* ───────────── 실시간 통신 (공개 MQTT 2곳 동시 사용 · 중복 제거) ───────────── */
  const Bus = {
    id: '', seq: 0, clients: [], seen: new Map(), handler: null,
    init(id, handler, onStatus) {
      this.id = id; this.handler = handler;
      this.clients = BROKERS.map(u => new window.MqttLite(u, { filter: ROOT + '/#', onMessage: (t, p) => this._in(p), onStatus: () => onStatus(this.clients.some(c => c.ready)) }));
    },
    send(sub, m) {
      m.i = this.id; m.k = this.seq = Math.max(Date.now(), this.seq + 1);
      const s = JSON.stringify(m);
      for (const c of this.clients) c.publish(ROOT + '/' + sub, s);
    },
    _in(payload) {
      let m; try { m = JSON.parse(payload); } catch (e) { return; }
      if (!m || typeof m.i !== 'string' || typeof m.k !== 'number' || m.i === this.id) return;
      if (m.k <= (this.seen.get(m.i) || 0)) return;
      if (this.seen.size > 3000) this.seen.clear();
      this.seen.set(m.i, m.k);
      try { this.handler(m); } catch (e) { console.error(e); }
    },
  };

  /* ───────────── 상태 ───────────── */
  const S = { ph: 'lobby', q: 0, at: 0, g: 0, ans: '', exp: '', endAt: 0 };
  let HD = null;                // 진행자 전용 정답 데이터
  let known = {};               // 이번 게임에서 공개된 정답
  let shownAns = '';            // 지금 화면에 공개된 정답
  const P = new Map();          // 참가자 캐릭터
  const savedMe = LS.get('me', null) || {};
  const me = { id: savedMe.id || rid(8), n: savedMe.n || '', c: clamp(savedMe.c | 0, 0, CHARS.length - 1), x: 0.3 + Math.random() * 0.4, y: 0.45 + Math.random() * 0.35, tx: 0, ty: 0, s: 0, a: '', aq: -1 };
  me.tx = me.x; me.ty = me.y;
  let score = LS.get('score', null) || { g: 0, m: {} };
  let joined = false, hostReady = false, lastShown = -1, revealT = 0, shuffleT = 0, hudZone = '';

  const els = { steps: [], chars: $('#chars'), arena: $('#arena'), timer: $('#timer'), ring: $('#tRing'), tNum: $('#tNum'), cntO: $('#cntO'), cntX: $('#cntX'), target: $('#target') };
  const RING = 2 * Math.PI * 52;
  let AW = 1, AH = 1;
  const measure = () => { const r = els.chars.getBoundingClientRect(); AW = r.width || 1; AH = r.height || 1; };
  addEventListener('resize', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(els.arena);

  /* ───────────── 화면 그리기 ───────────── */
  function renderSteps() {
    els.steps.forEach((li, i) => {
      let c = '';
      if (S.ph === 'final') c = 'done ' + (known[i] || '');
      else if (S.ph !== 'lobby') c = i < S.q ? 'done ' + (known[i] || '') : i === S.q ? (shownAns ? 'done ' + shownAns : 'now') : '';
      li.className = c;
    });
  }
  function renderQuestion(swap) {
    const item = QUIZ[S.q], qt = $('#qText'), len = item.q.length;
    $('#qNo').textContent = pad2(S.q + 1);
    $('#qClub').textContent = item.club;
    qt.textContent = item.q;
    qt.style.setProperty('--fs', len <= 45 ? 1 : len <= 62 ? 0.84 : len <= 90 ? 0.74 : 0.66);
    $('#qState').textContent = { question: '문제', countdown: '이동 중', locked: '이동 종료', reveal: '정답 · 해설' }[S.ph] || '';
    $('#tLabel').textContent = S.ph === 'countdown' ? 'SEC' : S.ph === 'locked' ? 'TIME UP' : 'READY';
    if (swap) { const b = $('#qBody'); b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap'); }
    renderSteps();
  }
  function banner(text, kind) {
    const b = $('#banner'); b.className = 'banner'; b.textContent = text; void b.offsetWidth; b.className = 'banner show ' + kind;
  }
  function updateTimer(now) {
    const rem = S.ph === 'countdown' ? clamp((S.endAt - now) / 1000, 0, COUNT_SEC) : S.ph === 'locked' ? 0 : COUNT_SEC;
    const shown = Math.ceil(rem - 0.001);
    els.ring.style.strokeDashoffset = (RING * (1 - rem / COUNT_SEC)).toFixed(1);
    if (shown === lastShown) return;
    const first = lastShown < 0; lastShown = shown;
    els.tNum.textContent = shown;
    els.timer.classList.toggle('hurry', (S.ph === 'countdown' && shown <= 5) || S.ph === 'locked');
    if (S.ph === 'countdown' && !first) {
      if (shown > 0) Sound.tick(shown);
      els.timer.classList.remove('beat'); void els.timer.offsetWidth; els.timer.classList.add('beat');
    }
  }
  function updateCount() { $('#onlineCount').textContent = P.size; $('#lobbyCount').textContent = P.size; }
  function updateDock() {
    if (!IS_HOST) return;
    const b = $('#btnMain');
    b.textContent = { lobby: '퀴즈 시작', question: '이동 시작 · ' + COUNT_SEC + '초', countdown: '카운트다운 중…', locked: '정답 공개', reveal: S.q < N - 1 ? '다음 문제' : '최종 결과 보기', final: '처음으로' }[S.ph];
    b.disabled = S.ph === 'countdown'; b.dataset.ph = S.ph;
    $('#btnPrev').disabled = S.ph === 'lobby';
  }
  function updateHUD() {
    if (IS_HOST || !joined) return;
    const zone = me.x < 0.5 ? 'O' : 'X', mine = me.aq === S.q ? me.a : '';
    let t = '';
    if (S.ph === 'lobby') t = '곧 시작합니다 · 경기장을 터치해 움직여 보세요';
    else if (S.ph === 'question') t = '문제를 읽고 O / X 구역으로 이동하세요';
    else if (S.ph === 'countdown') t = '지금 ' + zone + ' 구역 · 시간 안에 결정하세요!';
    else if (S.ph === 'locked') t = mine ? '내 선택은 ' + mine + ' · 정답 공개를 기다리는 중' : '이번 문제는 관전 중이에요';
    else if (S.ph === 'reveal') t = !shownAns ? '두구두구…' : !mine ? '이번 문제는 관전했어요' : mine === shownAns ? '정답입니다! 🎉' : '아쉬워요 · 다음 문제에서 만회!';
    else t = '최종 ' + me.s + ' / ' + N + ' 문제 정답';
    hudZone = zone;
    $('#meState').textContent = t; $('#meScore').textContent = me.s;
  }
  function renderFinal() {
    const list = [...P.values()].filter(p => p.n).sort((a, b) => (b.s | 0) - (a.s | 0) || a.n.localeCompare(b.n)).slice(0, 5);
    const ol = $('#rank'); ol.textContent = '';
    list.forEach((p, i) => {
      const li = document.createElement('li'); if (p === me) li.className = 'mine';
      [['span', ['🥇', '🥈', '🥉'][i] || i + 1], ['span', CHARS[p.c]], ['span', p.n], ['b', (p.s | 0) + ' / ' + N]].forEach(([tag, txt]) => { const e = document.createElement(tag); e.textContent = txt; li.appendChild(e); });
      ol.appendChild(li);
    });
    $('#rankEmpty').style.display = list.length ? 'none' : '';
    $('#finalMsg').textContent = !IS_HOST && joined ? me.n + ' 님은 ' + N + '문제 중 ' + me.s + '문제를 맞혔습니다.' : '10개 동아리가 준비한 모든 문제가 끝났습니다. 함께해 주셔서 감사합니다.';
  }

  /* ───────────── 단계 전환 ───────────── */
  function applyState(m) {
    const changed = m.at !== S.at, prev = { ph: S.ph, q: S.q };
    S.at = m.at; S.ph = PHASES.includes(m.ph) ? m.ph : 'lobby'; S.q = clamp(m.qi | 0, 0, N - 1); S.g = +m.g || 0;
    S.ans = S.ph === 'reveal' && (m.ans === 'O' || m.ans === 'X') ? m.ans : '';
    S.exp = S.ph === 'reveal' ? String(m.exp || '').slice(0, 300) : '';
    if (S.ph === 'countdown') {
      const end = performance.now() + clamp(+m.rem || 0, 0, COUNT_SEC * 1000);
      if (changed || Math.abs(end - S.endAt) > 400) S.endAt = end;
    }
    if (S.g !== score.g) { score = { g: S.g, m: {} }; known = {}; me.s = 0; LS.set('score', score); }
    if (changed || prev.ph !== S.ph || prev.q !== S.q) onPhase(prev);
  }
  function onPhase(prev) {
    const ph = S.ph;
    clearTimeout(revealT); clearInterval(shuffleT);
    app.classList.remove('shuffling');
    shownAns = ''; app.dataset.answer = ''; app.dataset.phase = ph; lastShown = -1;
    renderQuestion(prev.q !== S.q || prev.ph === 'lobby' || prev.ph === 'final');
    if (ph === 'question') { clearAnswer(); Sound.duck(false); Sound.swoosh(); }
    else if (ph === 'countdown') { clearAnswer(); Sound.duck(true); Sound.go(); banner('이동 시작!', 'go'); }
    else if (ph === 'locked') { lockMe(prev.ph); Sound.duck(true); Sound.timeup(); banner('STOP! 이동 종료', 'stop'); }
    else if (ph === 'reveal') { if (prev.ph !== 'locked') lockMe(prev.ph); startReveal(); }
    else if (ph === 'final') { Sound.duck(false); Sound.fanfare(); renderFinal(); [0, 350, 700, 1100].forEach((d, i) => setTimeout(() => FX.burst(0.2 + 0.2 * i, 0.3, ['#FFD166', '#86B8FF', '#FF93A7', '#fff'], 110), d)); }
    else Sound.duck(false);
    updateDock(); updateHUD();
  }
  function startReveal() {
    const at = S.at, mark = $('#aMark'); let f = 0;
    app.classList.add('shuffling');
    $('#expText').textContent = ''; $('#aSay').textContent = '';
    Sound.duck(true); Sound.roll(1.1);
    shuffleT = setInterval(() => { mark.textContent = f++ % 2 ? 'X' : 'O'; }, 85);
    revealT = setTimeout(() => {
      clearInterval(shuffleT);
      if (S.at !== at || S.ph !== 'reveal') return;
      app.classList.remove('shuffling');
      shownAns = S.ans; app.dataset.answer = S.ans; known[S.q] = S.ans;
      mark.textContent = S.ans || '?';
      $('#aSay').textContent = S.ans === 'O' ? '맞습니다' : '틀립니다';
      $('#expText').textContent = S.exp;
      Sound.duck(false); Sound.tada();
      banner('정답은 ' + S.ans + ' !', S.ans === 'O' ? 'o' : 'x');
      const r = els.arena.getBoundingClientRect(), O = S.ans === 'O';
      FX.burst((r.left + r.width * (O ? 0.25 : 0.75)) / innerWidth, (r.top + r.height * 0.4) / innerHeight, O ? ['#3B82F6', '#86B8FF', '#FFD166', '#fff'] : ['#F43F5E', '#FF93A7', '#FFD166', '#fff'], 150);
      if (!IS_HOST && joined && me.aq === S.q && me.a) {
        score.m[S.q] = me.a === S.ans ? 1 : 0; me.s = Object.values(score.m).reduce((a, b) => a + b, 0);
        LS.set('score', score); sendMe();
      }
      renderSteps(); updateHUD();
    }, 1150);
  }
  function clearAnswer() { me.a = ''; me.aq = -1; }
  function lockMe(prevPh) {
    if (IS_HOST || !joined) return;
    me.tx = me.x; me.ty = me.y;
    me.a = prevPh === 'countdown' || prevPh === 'question' ? (me.x < 0.5 ? 'O' : 'X') : '';
    me.aq = S.q; sendMe();
  }

  /* ───────────── 캐릭터 ───────────── */
  function ensureEl(p) {
    if (p.el) return;
    const el = document.createElement('div'), inner = document.createElement('div');
    el.className = 'ch' + (p === me ? ' me' : ''); inner.className = 'ch-in';
    ['ch-bubble', 'ch-badge', 'ch-emo', 'ch-name'].forEach(c => { const d = document.createElement('div'); d.className = c; inner.appendChild(d); });
    el.appendChild(inner); els.chars.appendChild(el);
    p.el = el; p.bubbleEl = inner.children[0]; p.emoEl = inner.children[2]; p.nameEl = inner.children[3];
  }
  function syncLabel(p) { p.emoEl.textContent = CHARS[p.c] || CHARS[0]; p.nameEl.textContent = p.n; }
  function dropPlayer(p) { if (p.el) p.el.remove(); P.delete(p.id); updateCount(); }
  function showEmote(p, i) {
    p.bubbleEl.textContent = EMOTES[clamp(i, 0, EMOTES.length - 1)];
    p.el.classList.add('emote'); clearTimeout(p.et); p.et = setTimeout(() => p.el.classList.remove('emote'), 1800);
  }
  function onPlayer(m) {
    const x = clamp(+m.x || 0, 0, 1), y = clamp(+m.y || 0, 0, 1);
    let p = P.get(m.i);
    if (!p) {
      if (P.size >= 300) return;
      p = { id: m.i, x, y, tx: x, ty: y }; P.set(m.i, p); ensureEl(p);
      if (IS_HOST) Sound.pop();
    }
    p.n = String(m.n || '').slice(0, 8) || '익명'; p.c = clamp(m.c | 0, 0, CHARS.length - 1); p.s = clamp(m.s | 0, 0, N);
    p.a = m.a === 'O' || m.a === 'X' ? m.a : '';
    p.tx = clamp(+m.tx || 0, 0, 1); p.ty = clamp(+m.ty || 0, 0, 1);
    if (Math.hypot((x - p.x) * 2, y - p.y) > 0.18) { p.x = x; p.y = y; }
    p.seen = performance.now(); syncLabel(p); updateCount();
  }
  let lastSend = 0, sendT = 0;
  function sendMe() {
    if (!joined) return;
    lastSend = performance.now();
    Bus.send('p/' + me.id, { t: 'p', n: me.n, c: me.c, x: r3(me.x), y: r3(me.y), tx: r3(me.tx), ty: r3(me.ty), s: me.s, a: me.aq === S.q ? me.a : '' });
  }
  function queueSend() {
    const el = performance.now() - lastSend;
    if (el > 160) sendMe(); else if (!sendT) sendT = setTimeout(() => { sendT = 0; sendMe(); }, 165 - el);
  }

  /* ───────────── 매 프레임 ───────────── */
  const keys = new Set();
  let lastT = performance.now(), cO = -1, cX = -1;
  function frame(now) {
    const dt = Math.min(0.06, (now - lastT) / 1000); lastT = now;
    if (joined && keys.size && S.ph !== 'locked') {
      const dx = (keys.has('R') ? 1 : 0) - (keys.has('L') ? 1 : 0), dy = (keys.has('D') ? 1 : 0) - (keys.has('U') ? 1 : 0);
      if (dx || dy) { me.tx = clamp(me.x + dx * 0.07, X_MIN, X_MAX); me.ty = clamp(me.y + dy * 0.14, Y_MIN, Y_MAX); queueSend(); }
    }
    const showA = S.ph === 'locked' || S.ph === 'reveal';
    let o = 0, x = 0;
    for (const p of P.values()) {
      const dx = (p.tx - p.x) * 2, dy = p.ty - p.y, d = Math.hypot(dx, dy), mv = d > 0.006;
      if (mv) { const st = Math.min(d, SPEED * dt); p.x += dx / d * st / 2; p.y += dy / d * st; }
      else if (d > 0) { p.x = p.tx; p.y = p.ty; }
      if (p.mv !== mv) { p.mv = mv; p.el.classList.toggle('walk', mv); }
      p.el.style.transform = 'translate3d(' + (p.x * AW).toFixed(1) + 'px,' + (p.y * AH).toFixed(1) + 'px,0)';
      p.el.style.zIndex = 10 + Math.round(p.y * 200);
      const a = showA ? (p === me ? (me.aq === S.q ? me.a : '') : p.a) : '';
      if (p._a !== a) { p._a = a; p.el.dataset.a = a; }
      const res = shownAns && a ? (a === shownAns ? 'win' : 'lose') : '';
      if (p._r !== res) { p._r = res; p.el.classList.remove('win', 'lose'); if (res) p.el.classList.add(res); }
      if (showA) { if (a === 'O') o++; else if (a === 'X') x++; } else if (p.x < 0.5) o++; else x++;
    }
    if (o !== cO) els.cntO.textContent = cO = o;
    if (x !== cX) els.cntX.textContent = cX = x;
    updateTimer(now);
    if (joined) {
      els.target.style.transform = 'translate3d(' + (me.tx * AW).toFixed(1) + 'px,' + (me.ty * AH).toFixed(1) + 'px,0)';
      els.target.classList.toggle('on', !!me.mv);
      if (S.ph === 'countdown' && (me.x < 0.5 ? 'O' : 'X') !== hudZone) updateHUD();
    }
    requestAnimationFrame(frame);
  }

  /* ───────────── 수신 ───────────── */
  function onNet(m) {
    if (m.t === 's') {
      if (typeof m.at !== 'number' || m.at < S.at || (IS_HOST && m.at === S.at)) return;
      applyState(m); if (IS_HOST) persistHost();
    } else if (m.t === 'p') onPlayer(m);
    else if (m.t === 'b') { const p = P.get(m.i); if (p && p !== me) dropPlayer(p); }
    else if (m.t === 'e') { const p = P.get(m.i); if (p) showEmote(p, m.e | 0); }
  }

  /* ───────────── 진행자 ───────────── */
  function decodeHD(b64) {
    const raw = atob(b64), key = 'songdo-ox', bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function persistHost() { LS.set('host', { at: S.at, ph: S.ph === 'countdown' ? 'question' : S.ph, q: S.q, g: S.g }); }
  function broadcastState() {
    const m = { t: 's', at: S.at, ph: S.ph, qi: S.q, g: S.g };
    if (S.ph === 'countdown') m.rem = Math.max(0, Math.round(S.endAt - performance.now()));
    if (S.ph === 'reveal') { m.ans = S.ans; m.exp = S.exp; }
    Bus.send('s', m);
  }
  function hostSet(patch) {
    const m = Object.assign({ at: Math.max(Date.now(), S.at + 1), ph: S.ph, qi: S.q, g: S.g }, patch);
    if (m.ph === 'reveal') {
      if (!HD) { alert('정답 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
      m.ans = HD[m.qi].a; m.exp = HD[m.qi].e;
    }
    applyState(m); persistHost(); broadcastState();
  }
  function primary() {
    if (S.ph === 'lobby') hostSet({ ph: 'question', qi: 0, g: Date.now() });
    else if (S.ph === 'question') hostSet({ ph: 'countdown', rem: COUNT_SEC * 1000 });
    else if (S.ph === 'locked') hostSet({ ph: 'reveal' });
    else if (S.ph === 'reveal') hostSet(S.q < N - 1 ? { ph: 'question', qi: S.q + 1 } : { ph: 'final' });
    else if (S.ph === 'final') hostSet({ ph: 'lobby', qi: 0 });
  }
  function prevStep() {
    if (S.ph === 'final') hostSet({ ph: 'reveal', qi: N - 1 });
    else if (S.ph !== 'question' && S.ph !== 'lobby') hostSet({ ph: 'question' });
    else if (S.ph === 'question') hostSet(S.q > 0 ? { ph: 'question', qi: S.q - 1 } : { ph: 'lobby' });
  }
  function initHost() {
    const url = location.origin + location.pathname.replace(/[^/]*$/, '');
    $('#joinUrl').textContent = $('#qrUrl').textContent = url.replace(/^https?:\/\//, '');
    const qs = document.createElement('script');
    qs.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    qs.onload = () => { try { const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make(); $('#qrImg').src = $('#qrBig').src = qr.createDataURL(8, 2); document.body.classList.add('has-qr'); } catch (e) {} };
    document.head.appendChild(qs);

    const hs = document.createElement('script');
    hs.src = 'host-data.js';
    hs.onload = () => {
      try { HD = decodeHD(window.__HD); } catch (e) { HD = null; }
      const sv = LS.get('host', null);
      if (HD && sv && sv.ph !== 'lobby' && Date.now() - sv.at < 3 * 3600e3 && sv.at > S.at) {
        const m = { at: sv.at, ph: sv.ph, qi: sv.q, g: sv.g };
        if (m.ph === 'reveal') { m.ans = HD[m.qi].a; m.exp = HD[m.qi].e; }
        applyState(m);
      }
    };
    document.head.appendChild(hs);

    $('#hostSplash').classList.add('show');
    $('#btnHostEnter').onclick = () => { Sound.start(); $('#hostSplash').classList.remove('show'); hostReady = true; broadcastState(); };
    $('#btnMain').onclick = primary;
    $('#btnPrev').onclick = prevStep;
    $('#btnNext').onclick = () => { if (S.ph === 'countdown') hostSet({ ph: 'locked' }); };
    const rb = $('#btnReset'); let armed = 0;
    rb.onclick = () => {
      if (armed) { clearTimeout(armed); armed = 0; rb.textContent = '↺ 처음으로'; hostSet({ ph: 'lobby', qi: 0 }); }
      else { rb.textContent = '한 번 더 누르면 초기화'; armed = setTimeout(() => { armed = 0; rb.textContent = '↺ 처음으로'; }, 3000); }
    };
    $('#btnQR').onclick = () => $('#qrModal').classList.add('show');
    $('#btnQRClose').onclick = () => $('#qrModal').classList.remove('show');
    $('#qrModal').onclick = e => { if (e.target.id === 'qrModal') e.target.classList.remove('show'); };
    $('#btnFull').onclick = toggleFull;
    setInterval(broadcastState, 1500);
    setInterval(() => { if (S.ph === 'countdown' && performance.now() >= S.endAt) hostSet({ ph: 'locked' }); }, 60);
    updateDock();
  }

  /* ───────────── 참가자 ───────────── */
  function initPlayer() {
    $('#lobbyLead').textContent = '곧 퀴즈가 시작됩니다 · 아래 경기장에서 캐릭터를 움직여 보세요!';
    const grid = $('#charGrid'); let sel = me.c;
    CHARS.forEach((ch, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'char-opt' + (i === sel ? ' on' : ''); b.textContent = ch;
      b.onclick = () => { sel = i; const on = grid.querySelector('.on'); if (on) on.classList.remove('on'); b.classList.add('on'); $('#pvEmo').textContent = ch; };
      grid.appendChild(b);
    });
    $('#pvEmo').textContent = CHARS[sel]; $('#inName').value = me.n;
    $('#joinForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#inName').value.trim().slice(0, 8);
      if (!name) { $('#inName').focus(); return; }
      me.n = name; me.c = sel; LS.set('me', { id: me.id, n: name, c: sel });
      joined = true; Sound.start();
      $('#join').classList.remove('show'); $('#inName').blur();
      me.s = Object.values(score.m).reduce((a, b) => a + b, 0);
      P.set(me.id, me); ensureEl(me); syncLabel(me);
      $('#meEmo').textContent = CHARS[me.c]; $('#meName').textContent = me.n;
      measure(); sendMe(); updateCount(); updateHUD();
      if (S.ph === 'final') renderFinal();
    });
    $('#join').classList.add('show');

    EMOTES.forEach((em, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = em; let last = 0;
      b.onclick = () => { const now = performance.now(); if (!joined || now - last < 500) return; last = now; showEmote(me, i); Bus.send('e/' + me.id, { t: 'e', e: i }); };
      $('#emotes').appendChild(b);
    });

    let drag = false;
    const moveTo = e => {
      if (!joined || S.ph === 'locked') return;
      const r = els.arena.getBoundingClientRect();
      me.tx = clamp((e.clientX - r.left) / r.width, X_MIN, X_MAX); me.ty = clamp((e.clientY - r.top) / r.height, Y_MIN, Y_MAX);
      queueSend();
    };
    els.arena.addEventListener('pointerdown', e => { drag = true; try { els.arena.setPointerCapture(e.pointerId); } catch (x) {} moveTo(e); });
    els.arena.addEventListener('pointermove', e => { if (drag) moveTo(e); });
    ['pointerup', 'pointercancel'].forEach(t => els.arena.addEventListener(t, () => { drag = false; }));

    setInterval(() => { if (joined && performance.now() - lastSend > 2300) sendMe(); }, 700);
    addEventListener('pagehide', () => { if (joined) Bus.send('p/' + me.id, { t: 'b' }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && joined) sendMe(); });
  }

  /* ───────────── 공통 ───────────── */
  function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); }
  function syncSoundBtn() { const b = $('#btnSound'); b.textContent = Sound.muted ? '🔇' : '🔊'; b.classList.toggle('off', Sound.muted); }
  $('#btnSound').onclick = () => { Sound.start(); Sound.toggle(); syncSoundBtn(); };
  syncSoundBtn();
  addEventListener('pointerdown', () => { if (joined || hostReady) Sound.start(); });

  const DIR = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D' };
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyM') { Sound.toggle(); syncSoundBtn(); return; }
    if (IS_HOST) {
      if (!hostReady) return;
      if (e.code === 'KeyF') return toggleFull();
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'PageDown' || e.code === 'ArrowRight') {
        e.preventDefault(); if (e.repeat) return;
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if ($('#qrModal').classList.contains('show')) $('#qrModal').classList.remove('show'); else primary();
      } else if (e.code === 'ArrowLeft' || e.code === 'PageUp') { e.preventDefault(); if (!e.repeat) prevStep(); }
    } else if (DIR[e.code]) { e.preventDefault(); keys.add(DIR[e.code]); }
  });
  addEventListener('keyup', e => { if (DIR[e.code]) keys.delete(DIR[e.code]); });
  addEventListener('blur', () => keys.clear());

  setInterval(() => {                       // 접속이 끊긴 캐릭터 정리 + 결과 갱신
    const now = performance.now();
    for (const p of [...P.values()]) if (p !== me && now - p.seen > 9000) dropPlayer(p);
    if (S.ph === 'final') renderFinal();
  }, 2000);

  /* ───────────── 시작 ───────────── */
  const stepsEl = $('#steps');
  for (let i = 0; i < N; i++) { const li = document.createElement('li'); stepsEl.appendChild(li); els.steps.push(li); }
  QUIZ.forEach(q => { const s = document.createElement('span'); s.textContent = q.club; $('#clubs').appendChild(s); });
  renderQuestion(false); measure(); updateCount();
  Bus.init(IS_HOST ? 'H' + rid(6) : me.id, onNet, on => $('#netPill').classList.toggle('on', on));
  if (IS_HOST) initHost(); else initPlayer();
  requestAnimationFrame(frame);
})();
