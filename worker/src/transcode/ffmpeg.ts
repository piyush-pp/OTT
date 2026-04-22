import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

type Rendition = { name: "360p" | "720p" | "1080p"; height: number; bandwidth: number };

const renditions: Rendition[] = [
  { name: "360p", height: 360, bandwidth: 800_000 },
  { name: "720p", height: 720, bandwidth: 2_800_000 },
  { name: "1080p", height: 1080, bandwidth: 5_000_000 }
];

export async function transcodeToHls(params: {
  inputPath: string;
  outDir: string;
  onProgress?: (p: { rendition: string; percent: number }) => void;
}) {
  await mkdir(params.outDir, { recursive: true });
  const durationSeconds = await probeDurationSeconds(params.inputPath);

  // Create each rendition independently for a reliable MVP.
  for (const r of renditions) {
    const renditionDir = path.join(params.outDir, r.name);
    await mkdir(renditionDir, { recursive: true });

    const playlistPath = path.join(renditionDir, "index.m3u8");
    const segmentPattern = path.join(renditionDir, `seg_%05d.ts`);

    await runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      params.inputPath,

      // Video
      "-vf",
      `scale=-2:${r.height}`,
      "-c:v",
      "libx264",
      "-profile:v",
      "main",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-maxrate",
      String(Math.floor(r.bandwidth / 1000)) + "k",
      "-bufsize",
      String(Math.floor((r.bandwidth * 2) / 1000)) + "k",

      // Audio
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",

      // HLS
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath,

      // Progress to stdout for parsing
      "-progress",
      "pipe:1",
      "-nostats"
    ], (kv) => {
      if (!params.onProgress) return;
      const outTimeSeconds = kv.out_time_ms ? Number(kv.out_time_ms) / 1_000_000 : undefined;
      if (!outTimeSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
      const percent = Math.max(0, Math.min(100, Math.round((outTimeSeconds / durationSeconds) * 100)));
      params.onProgress({ rendition: r.name, percent });
    });
  }

  const master = buildMasterPlaylist();
  return { masterPlaylist: master, renditions };
}

export async function generateThumbnail(params: { inputPath: string; outPath: string }) {
  await mkdir(path.dirname(params.outPath), { recursive: true });
  await runFfmpeg([
    "-hide_banner",
    "-y",
    "-ss",
    "00:00:01",
    "-i",
    params.inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    params.outPath
  ]);
}

function buildMasterPlaylist() {
  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3"
  ];
  const widthForHeight: Record<number, number> = { 360: 640, 720: 1280, 1080: 1920 };
  for (const r of renditions) {
    const width = widthForHeight[r.height] ?? 1920;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${width}x${r.height}`,
      `${r.name}/index.m3u8`
    );
  }
  return lines.join("\n") + "\n";
}

async function probeDurationSeconds(inputPath: string) {
  // Best-effort: relies on ffprobe being installed alongside ffmpeg.
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath
  ];
  const ff = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  ff.stdout?.on("data", (b) => (out += b.toString("utf8")));
  ff.stderr?.on("data", (b) => (err += b.toString("utf8")));
  const code: number = await new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) throw new Error(`ffprobe failed (exit ${code}): ${err.slice(-2000)}`);
  const duration = Number(out.trim());
  if (!Number.isFinite(duration)) throw new Error(`ffprobe returned invalid duration: "${out.trim()}"`);
  return duration;
}

async function runFfmpeg(args: string[], onProgressKv?: (kv: Record<string, string>) => void) {
  const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";

  if (ff.stdout) {
    ff.stdout.on("data", (buf) => {
      const chunk = buf.toString("utf8");
      stdout += chunk;
      // Parse -progress key=value pairs, best-effort.
      if (onProgressKv) {
        const lines = chunk.split("\n");
        const kv: Record<string, string> = {};
        for (const line of lines) {
          const idx = line.indexOf("=");
          if (idx > 0) kv[line.slice(0, idx)] = line.slice(idx + 1).trim();
        }
        if (Object.keys(kv).length) onProgressKv(kv);
      }
    });
  }

  if (ff.stderr) {
    ff.stderr.on("data", (buf) => {
      stderr += buf.toString("utf8");
    });
  }

  const code: number = await new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (c) => resolve(c ?? 1));
  });

  if (code !== 0) {
    throw new Error(`ffmpeg failed (exit ${code}). stderr: ${stderr.slice(-4000)} stdout: ${stdout.slice(-1000)}`);
  }
}
