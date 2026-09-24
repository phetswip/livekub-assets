/**
 * streamer.js — RTMP push engine (ffmpeg)
 *
 * This module pushes a local video file to an RTMP ingest endpoint using a
 * stream key that the operator supplies themselves. It works with any platform
 * that gives you an official RTMP URL + stream key, for example:
 *   - TikTok LIVE Studio  (rtmp://... + key from the LIVE Studio dashboard)
 *   - Shopee Live         (rtmp://... + key from the Shopee Seller / Live tool)
 *   - YouTube / Twitch / OBS-compatible ingests
 *
 * It does NOT log into any platform, scrape cookies, or bypass any access
 * control. The operator is responsible for holding the right to stream to the
 * endpoint they configure.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

/** Basic guard so we only ever push to a real RTMP(S) ingest URL. */
export function isValidRtmpUrl(url) {
  return typeof url === 'string' && /^rtmps?:\/\/[^\s]+$/i.test(url.trim());
}

/**
 * A single live session: one ffmpeg process pushing one source to one ingest.
 */
export class StreamSession extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.id            unique session id
   * @param {string} opts.inputPath     local video file to stream
   * @param {string} opts.rtmpUrl       ingest base url, e.g. rtmp://host/live
   * @param {string} opts.streamKey     operator's own stream key
   * @param {boolean} [opts.loop=true]  loop the clip for continuous live
   * @param {string} [opts.title]       human label
   */
  constructor(opts) {
    super();
    this.id = opts.id;
    this.inputPath = opts.inputPath;
    this.rtmpUrl = opts.rtmpUrl.replace(/\/+$/, '');
    this.streamKey = opts.streamKey;
    this.loop = opts.loop !== false;
    this.title = opts.title || 'Live session';
    this.status = 'idle';
    this.proc = null;
    this.startedAt = null;
    this.lastError = null;
  }

  get target() {
    return `${this.rtmpUrl}/${this.streamKey}`;
  }

  start() {
    if (this.proc) return;

    // Re-encode to a broadcast-safe H.264/AAC profile and mux to FLV/RTMP.
    // Looping the input keeps the clip playing continuously (24/7 style).
    const args = [
      '-re',
      ...(this.loop ? ['-stream_loop', '-1'] : []),
      '-i', this.inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '2500k',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      this.target,
    ];

    this.proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.status = 'live';
    this.startedAt = Date.now();
    this.emit('status', this.publicState());

    this.proc.stderr.on('data', (chunk) => {
      // ffmpeg writes progress to stderr; keep only the last line for status.
      this.lastLog = chunk.toString().trim().split('\n').pop();
    });

    this.proc.on('error', (err) => {
      this.lastError = err.code === 'ENOENT'
        ? 'ffmpeg not found — install ffmpeg and ensure it is on PATH'
        : err.message;
      this.status = 'error';
      this.proc = null;
      this.emit('status', this.publicState());
    });

    this.proc.on('exit', (code, signal) => {
      this.proc = null;
      if (this.status === 'stopping') {
        this.status = 'idle';
      } else if (code === 0) {
        this.status = 'ended';
      } else {
        this.status = 'error';
        this.lastError = this.lastLog || `ffmpeg exited with code ${code} (${signal || 'no signal'})`;
      }
      this.emit('status', this.publicState());
    });
  }

  stop() {
    if (!this.proc) {
      this.status = 'idle';
      return;
    }
    this.status = 'stopping';
    this.proc.kill('SIGINT');
  }

  /** Safe-to-serialize view (never exposes the stream key). */
  publicState() {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      rtmpUrl: this.rtmpUrl,
      loop: this.loop,
      startedAt: this.startedAt,
      uptimeSec: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      lastError: this.lastError,
    };
  }
}

/** In-memory registry of active sessions. */
export class StreamManager {
  constructor() {
    this.sessions = new Map();
  }

  create(opts) {
    const session = new StreamSession(opts);
    this.sessions.set(session.id, session);
    return session;
  }

  get(id) {
    return this.sessions.get(id);
  }

  list() {
    return [...this.sessions.values()].map((s) => s.publicState());
  }

  remove(id) {
    const s = this.sessions.get(id);
    if (s) s.stop();
    this.sessions.delete(id);
  }
}
