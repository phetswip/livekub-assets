/**
 * index.js — HTTP API + static web UI for the AI Live restream service.
 *
 * Flow:
 *   1. Operator uploads a clip (or an AI-generated / lip-synced video) via the web UI.
 *   2. Operator pastes their OWN official RTMP url + stream key for the platform
 *      they are entitled to stream to (TikTok LIVE Studio, Shopee Live, ...).
 *   3. The server pushes the clip to that ingest with ffmpeg.
 *
 * No platform credentials, cookies, or session tokens are ever collected.
 */

import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { StreamManager, isValidRtmpUrl } from './streamer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UPLOAD_DIR = join(ROOT, 'uploads');
const PORT = process.env.PORT || 8000;

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const manager = new StreamManager();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = randomUUID() + (extname(file.originalname) || '.mp4');
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    cb(null, /^video\//.test(file.mimetype));
  },
});

const app = express();
app.use(express.json());
app.use(express.static(join(ROOT, 'public')));

// --- Upload a clip ---------------------------------------------------------
app.post('/api/v1/video/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file received (field name must be "file").' });
  }
  res.json({
    status: 'SUCCESS',
    filename: req.file.filename,
    originalName: req.file.originalname,
    sizeBytes: req.file.size,
  });
});

// --- Start a live restream -------------------------------------------------
app.post('/api/v1/live/start', (req, res) => {
  const { filename, rtmpUrl, streamKey, title, loop } = req.body || {};

  if (!filename) return res.status(400).json({ error: 'filename is required (upload a clip first).' });
  const inputPath = join(UPLOAD_DIR, filename);
  if (!existsSync(inputPath)) return res.status(404).json({ error: 'Uploaded file not found.' });

  if (!isValidRtmpUrl(rtmpUrl)) {
    return res.status(400).json({ error: 'rtmpUrl must be a valid rtmp:// or rtmps:// ingest URL from your platform.' });
  }
  if (!streamKey || typeof streamKey !== 'string') {
    return res.status(400).json({ error: 'streamKey is required — paste your own official stream key.' });
  }

  const session = manager.create({
    id: randomUUID(),
    inputPath,
    rtmpUrl,
    streamKey,
    title,
    loop,
  });

  try {
    session.start();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ status: 'SUCCESS', session: session.publicState() });
});

// --- Stop a live restream --------------------------------------------------
app.post('/api/v1/live/stop', (req, res) => {
  const { id } = req.body || {};
  const session = manager.get(id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  session.stop();
  res.json({ status: 'SUCCESS', session: session.publicState() });
});

// --- List sessions ---------------------------------------------------------
app.get('/api/v1/live/status', (_req, res) => {
  const sessions = manager.list();
  res.json({ is_live: sessions.some((s) => s.status === 'live'), sessions });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[livekub-live] listening on http://localhost:${PORT}`);
});
