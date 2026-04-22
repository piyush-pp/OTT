## OTT streaming MVP

Full-stack MVP for adaptive bitrate video streaming (HLS) with a production-like structure:

- **Backend**: Node.js + Express + Prisma (Postgres) + JWT auth
- **Queue**: BullMQ + Redis
- **Worker**: FFmpeg transcode → HLS ladder (360p/720p/1080p) + upload to S3-compatible storage
- **Storage**: MinIO (S3-compatible) for local dev
- **CDN**: nginx reverse proxy (local stand-in) at `http://localhost:8080`
- **Frontend**: React + Vite + Video.js HLS playback

### Prereqs

- Node.js 20+
- Docker Desktop (for Postgres/Redis/MinIO/nginx)
- FFmpeg installed locally (only if you run the worker on host). If you run the worker in Docker, FFmpeg is included.

### 1) Start infrastructure

```bash
docker compose up -d
```

MinIO:
- S3 endpoint: `http://localhost:9000`
- Console: `http://localhost:9001` (user/pass: `minioadmin`/`minioadmin`)
- Bucket: `ott` (auto-created), anonymous download enabled (so CDN playback works)

Local “CDN” base URL:
- `http://localhost:8080`

### 2) Create env files

Copy `.env.example` into each app:

```bash
cp .env.example backend/.env
cp .env.example worker/.env
cp .env.example frontend/.env
```

### 3) Install dependencies

```bash
npm install
```

### 4) Database migration

```bash
npm -w backend run prisma:generate
npm -w backend run prisma:migrate
```

### 5) Run apps (3 terminals)

```bash
npm -w backend run dev
npm -w worker run dev
npm -w frontend run dev
```

Frontend will be at `http://localhost:5173`.

### 6) Try it

1. Signup / login in the UI
2. Upload a video
3. Wait for transcode to finish
4. Play via the HLS URL served from the CDN base

### Notes

- Uploads go to `uploads/{videoId}/input.mp4` in the bucket.
- Transcoded outputs go to `videos/{videoId}/hls/`.
- Playback URL format: `${CDN_BASE_URL}/videos/{videoId}/hls/master.m3u8`.
