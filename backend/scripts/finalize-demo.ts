/**
 * One-shot script to clean up demo data so it matches the canonical state
 * after a stakeholder demo run-through. Idempotent and safe to re-run.
 *
 * Run:  cd backend && npx tsx scripts/finalize-demo.ts
 *
 * - Removes leftover test users + their videos (phase3test, phase4test, etc.)
 * - Removes ad-hoc test videos uploaded during verification (SSE Test, etc.)
 * - Restores canonical visibility for the 6 seed videos
 * - Resets viewCount/featured on all seed videos to the demo defaults
 * - Re-queues the 6 seed videos so the worker regenerates multi-size thumbnails
 * - Sets Big Buck Bunny as the featured hero
 */

import { prisma } from "../src/db/prisma.js";
import { videoTranscodeQueue } from "../src/queue/videoQueue.js";
import { deleteByPrefix } from "../src/services/s3.js";
import { env } from "../src/utils/env.js";

const TEST_USER_EMAILS = [
  "phase3test@demo.com",
  "phase4test@example.com"
];

const TEST_VIDEO_TITLES = [
  "SSE Test",
  "SSE Test 2",
  "Phase4 Test Video",
  "Phase4 Public Test"
];

// Canonical state for the 6 seeded videos.
const SEED_CANONICAL: Record<
  string,
  { visibility: "PRIVATE" | "UNLISTED" | "PUBLIC"; featured: boolean }
> = {
  seed_0: { visibility: "PUBLIC", featured: true },   // Big Buck Bunny — featured hero
  seed_1: { visibility: "PUBLIC", featured: false },  // Sintel
  seed_2: { visibility: "PUBLIC", featured: false },  // Tears of Steel
  seed_3: { visibility: "PRIVATE", featured: false }, // Elephants Dream
  seed_4: { visibility: "PRIVATE", featured: false }, // For Bigger Joyrides
  seed_5: { visibility: "UNLISTED", featured: false } // Subaru Outback
};

async function deleteVideoCompletely(videoId: string, title: string) {
  // S3 cleanup first (HLS + uploads + thumbnails)
  await Promise.all([
    deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `videos/${videoId}/` }),
    deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `uploads/${videoId}/` })
  ]).catch((e) => console.error(`  [s3 cleanup warning] ${videoId}:`, e));

  // DB cascade handles watchHistory + shareLinks
  await prisma.video.delete({ where: { id: videoId } });
  console.log(`  ✓ deleted ${videoId} — ${title}`);
}

async function main() {
  console.log("=== 1. Removing test videos ===");

  // Step 1: delete test videos by title
  const testVideos = await prisma.video.findMany({
    where: { title: { in: TEST_VIDEO_TITLES } }
  });
  for (const v of testVideos) {
    await deleteVideoCompletely(v.id, v.title);
  }
  if (testVideos.length === 0) console.log("  (none found)");

  console.log("\n=== 2. Removing test users (and their remaining videos) ===");

  for (const email of TEST_USER_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`  [skip] ${email} not present`);
      continue;
    }
    // Delete all their videos first (FK Restrict)
    const orphanVideos = await prisma.video.findMany({ where: { userId: user.id } });
    for (const v of orphanVideos) {
      await deleteVideoCompletely(v.id, v.title);
    }
    // Cascade removes refreshTokens / passwordResets / watchHistory / shareLinks;
    // AuditLog FK is SetNull so historical rows are preserved (anonymised).
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`  ✓ deleted user ${email}`);
  }

  console.log("\n=== 3. Restoring canonical state on the 6 seed videos ===");

  for (const [videoId, canonical] of Object.entries(SEED_CANONICAL)) {
    const updated = await prisma.video.updateMany({
      where: { id: videoId },
      data: {
        visibility: canonical.visibility,
        featured: canonical.featured,
        viewCount: 0
      }
    });
    if (updated.count > 0) {
      console.log(
        `  ✓ ${videoId} → visibility=${canonical.visibility}, featured=${canonical.featured}, viewCount=0`
      );
    } else {
      console.log(`  [skip] ${videoId} not present (seed may not have run)`);
    }
  }

  console.log("\n=== 4. Clearing watch history (so 'Continue Watching' starts empty) ===");

  const wiped = await prisma.watchHistory.deleteMany({});
  console.log(`  ✓ removed ${wiped.count} watch-history row(s)`);

  console.log("\n=== 5. Re-queuing seed videos so worker regenerates multi-size thumbnails ===");

  for (const videoId of Object.keys(SEED_CANONICAL)) {
    const v = await prisma.video.findUnique({ where: { id: videoId } });
    if (!v) continue;
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "UPLOADED", progress: 0, error: null }
    });
    await videoTranscodeQueue.add("transcode", {
      videoId: v.id,
      bucket: env.S3_BUCKET,
      inputKey: v.inputKey
    });
    console.log(`  ↻ queued ${videoId}`);
  }

  console.log("\n=== Done ===");
  console.log("Now start the worker (`cd worker && npm run dev`) and watch the seed videos transcode.");
  console.log("They will land READY again with thumb_sm/md/lg.jpg generated.");

  await prisma.$disconnect();
  await videoTranscodeQueue.close();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
