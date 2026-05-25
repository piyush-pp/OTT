/**
 * Seed script — populates the DB with three demo users and six sample videos,
 * uploads the mp4 inputs to MinIO/S3, and queues transcode jobs.
 *
 * Idempotent: re-running this script does NOT duplicate users or videos; it
 * skips any video that already exists for the given owner.
 *
 * Run: `npm run seed` from backend/.
 */
import bcrypt from "bcryptjs";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "../src/db/prisma.js";
import { env } from "../src/utils/env.js";
import { s3 } from "../src/services/s3.js";
import { videoTranscodeQueue } from "../src/queue/videoQueue.js";

type Visibility = "PUBLIC" | "PRIVATE" | "UNLISTED";
type DemoRole = "USER" | "ADMIN";

const DEMO_USERS: Array<{
  email: string;
  password: string;
  role: DemoRole;
  displayName: string;
}> = [
  { email: "alice@demo.com", password: "demo1234", role: "USER", displayName: "Alice" },
  { email: "bob@demo.com", password: "demo1234", role: "USER", displayName: "Bob" },
  { email: "admin@demo.com", password: "admin1234", role: "ADMIN", displayName: "Admin" }
];

/**
 * NOTE: The original gtv-videos-bucket on Google Cloud Storage
 * (commondatastorage.googleapis.com) returns 403 Anonymous as of this writing,
 * so we mirror to publicly-fetchable replacements:
 *   - test-videos.co.uk (short clips, ~5MB)
 *   - download.blender.org (official Blender Foundation mirrors)
 *   - media.w3.org (W3C test assets)
 * For titles whose canonical samples are no longer publicly downloadable
 * (Tears of Steel, For Bigger Joyrides, Subaru Outback), we substitute a
 * stand-in MP4 of similar size so the transcode pipeline still has something
 * to chew on. Title/category/visibility/owner mapping matches PHASES.md.
 */
const SAMPLE_VIDEOS: Array<{
  url: string;
  title: string;
  category: string;
  visibility: Visibility;
  featured?: boolean;
  owner: "alice@demo.com" | "bob@demo.com";
}> = [
  {
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_5MB.mp4",
    title: "Big Buck Bunny",
    category: "Entertainment",
    visibility: "PUBLIC",
    featured: true, // featured hero on the Browse page
    owner: "alice@demo.com"
  },
  {
    url: "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4",
    title: "Sintel",
    category: "Entertainment",
    visibility: "PUBLIC",
    owner: "bob@demo.com"
  },
  {
    url: "https://media.w3.org/2010/05/video/movie_300.mp4",
    title: "Tears of Steel",
    category: "Entertainment",
    visibility: "PUBLIC",
    owner: "bob@demo.com"
  },
  {
    url: "https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4",
    title: "Elephants Dream",
    category: "Tutorial",
    visibility: "PRIVATE",
    owner: "alice@demo.com"
  },
  {
    url: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_5MB.mp4",
    title: "For Bigger Joyrides",
    category: "Sports",
    visibility: "PRIVATE",
    owner: "alice@demo.com"
  },
  {
    url: "https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_5MB.mp4",
    title: "Subaru Outback Off-road",
    category: "Sports",
    visibility: "UNLISTED",
    owner: "bob@demo.com"
  }
];

function printCredentialsBanner() {
  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────────┐");
  console.log("│  Demo credentials                                                │");
  console.log("├──────────────────────────────────────────────────────────────────┤");
  for (const u of DEMO_USERS) {
    const line = `  ${u.email.padEnd(20)} ${u.password.padEnd(12)} (${u.role})`;
    console.log(`│${line.padEnd(66)}│`);
  }
  console.log("└──────────────────────────────────────────────────────────────────┘");
  console.log("");
}

async function upsertUsers() {
  console.log("=== Seeding demo users ===");
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, displayName: u.displayName, emailVerified: true },
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        displayName: u.displayName,
        emailVerified: true
      }
    });
    console.log(`  [user] ${u.email}  (${u.role})`);
  }
}

async function seedVideos() {
  console.log("\n=== Seeding sample videos ===");
  const owners = new Map<string, { id: string; email: string }>();
  for (const email of ["alice@demo.com", "bob@demo.com"] as const) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Owner ${email} not found after upsert`);
    owners.set(email, { id: user.id, email });
  }

  for (let i = 0; i < SAMPLE_VIDEOS.length; i++) {
    const sample = SAMPLE_VIDEOS[i];
    const owner = owners.get(sample.owner)!;

    const existing = await prisma.video.findFirst({
      where: { title: sample.title, userId: owner.id }
    });
    if (existing) {
      console.log(`  [skip] ${sample.title} already exists for ${owner.email}`);
      continue;
    }

    const videoId = `seed_${i}`;
    const inputKey = `uploads/${videoId}/input.mp4`;

    console.log(`  [download] ${sample.title} ← ${sample.url}`);
    const res = await fetch(sample.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${sample.url}: ${res.status} ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    console.log(`  [upload]   ${inputKey} (${buffer.length} bytes)`);
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: inputKey,
        Body: buffer,
        ContentType: "video/mp4"
      })
    );

    await prisma.video.create({
      data: {
        id: videoId,
        title: sample.title,
        status: "UPLOADED",
        visibility: sample.visibility,
        category: sample.category,
        featured: sample.featured ?? false,
        inputUrl: `s3://${env.S3_BUCKET}/${inputKey}`,
        inputKey,
        userId: owner.id,
        sizeBytes: BigInt(buffer.length)
      }
    });

    await videoTranscodeQueue.add("transcode", {
      videoId,
      bucket: env.S3_BUCKET,
      inputKey
    });

    console.log(`  [queued]   ${sample.title} → ${owner.email} (${sample.visibility})`);
  }
}

async function main() {
  printCredentialsBanner();
  await upsertUsers();
  await seedVideos();
  console.log("\n=== Done. Transcoding will complete in the worker. ===");
  printCredentialsBanner();
  console.log("Login at http://localhost:5173 with any of the credentials above.");
}

main()
  .then(async () => {
    await videoTranscodeQueue.close().catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err);
    await videoTranscodeQueue.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
