/* 초경량 MQTT 3.1.1 (QoS 0) over WebSocket 클라이언트 — 외부 라이브러리 없이 실시간 동기화에 사용 */
(function (g) {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const str = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const packet = (type, flags, body) => {
    const len = []; let n = body.length;
    do { let d = n % 128; n = (n - d) / 128; if (n > 0) d |= 128; len.push(d); } while (n > 0);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = (type << 4) | flags; out.set(len, 1); out.set(body, 1 + len.length);
    return out;
  };

  class MqttLite {
    constructor(url, opts) {
      this.url = url; this.filter = opts.filter;
      this.onMessage = opts.onMessage; this.onStatus = opts.onStatus || (() => {});
      this.ready = false; this.closed = false; this.retry = 0; this.buf = new Uint8Array(0);
      this.connect();
    }
    connect() {
      if (this.closed) return;
      let ws;
      try { ws = new WebSocket(this.url, 'mqtt'); } catch (e) { return this._again(); }
      this.ws = ws; ws.binaryType = 'arraybuffer'; this.buf = new Uint8Array(0);
      clearTimeout(this.wd);
      this.wd = setTimeout(() => { if (!this.ready && this.ws === ws) { try { ws.close(); } catch (e) {} } }, 9000);
      ws.onopen = () => {
        const id = 'sdox_' + Math.random().toString(36).slice(2, 12);
        ws.send(packet(1, 0, [...str('MQTT'), 4, 2, 0, 30, ...str(id)]));
      };
      ws.onmessage = e => this._feed(new Uint8Array(e.data));
      ws.onclose = () => { if (this.ws !== ws) return; this._down(); this._again(); };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    }
    _down() { clearInterval(this.ping); if (this.ready) { this.ready = false; this.onStatus(false); } }
    _again() {
      if (this.closed) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.connect(), Math.min(8000, 800 * 2 ** this.retry++));
    }
    _feed(chunk) {
      let b = this.buf;
      if (b.length) { const m = new Uint8Array(b.length + chunk.length); m.set(b); m.set(chunk, b.length); b = m; } else b = chunk;
      for (;;) {
        if (b.length < 2) break;
        let len = 0, mul = 1, i = 1, done = false;
        for (; i < b.length && i <= 4; i++) {
          len += (b[i] & 127) * mul; mul *= 128;
          if (!(b[i] & 128)) { done = true; i++; break; }
        }
        if (!done || b.length < i + len) break;
        try { this._handle(b[0], b.subarray(i, i + len)); } catch (e) {}
        b = b.subarray(i + len);
      }
      this.buf = b.length ? b.slice() : new Uint8Array(0);
    }
    _handle(h, body) {
      const type = h >> 4;
      if (type === 2) {                       // CONNACK
        if (body[1] !== 0) { try { this.ws.close(); } catch (e) {} return; }
        this.ws.send(packet(8, 2, [0, 1, ...str(this.filter), 0]));
        this.retry = 0; this.ready = true; this.onStatus(true);
        clearInterval(this.ping);
        this.ping = setInterval(() => { if (this.ws.readyState === 1) this.ws.send(packet(12, 0, [])); }, 20000);
      } else if (type === 3) {                // PUBLISH
        const qos = (h >> 1) & 3, tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        this.onMessage(topic, dec.decode(body.subarray(2 + tl + (qos ? 2 : 0))));
      }
    }
    publish(topic, payload) {
      if (!this.ready || this.ws.readyState !== 1) return false;
      const t = str(topic), p = enc.encode(payload), body = new Uint8Array(t.length + p.length);
      body.set(t); body.set(p, t.length);
      this.ws.send(packet(3, 0, body));
      return true;
    }
    close() { this.closed = true; clearTimeout(this.timer); clearTimeout(this.wd); this._down(); try { this.ws.close(); } catch (e) {} }
  }
  g.MqttLite = MqttLite;
})(typeof window !== 'undefined' ? window : globalThis);
