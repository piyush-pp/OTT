import { prisma } from "../db/prisma.js";
import { HttpError } from "../utils/errors.js";

function ownerThumbnailPath(videoId: string) {
  return `/videos/${videoId}/thumbnail`;
}

function ownerThumbnailSet(videoId: string) {
  return {
    sm: `/videos/${videoId}/thumbnail?size=sm`,
    md: `/videos/${videoId}/thumbnail?size=md`,
    lg: `/videos/${videoId}/thumbnail?size=lg`
  };
}

function publicThumbnailPath(videoId: string) {
  return `/api/v1/browse/${videoId}/thumbnail`;
}

function publicThumbnailSet(videoId: string) {
  return {
    sm: `/api/v1/browse/${videoId}/thumbnail?size=sm`,
    md: `/api/v1/browse/${videoId}/thumbnail?size=md`,
    lg: `/api/v1/browse/${videoId}/thumbnail?size=lg`
  };
}

/** Returns the last 7 days, oldest first, as YYYY-MM-DD strings (UTC). */
function last7Days(): string[] {
  const out: string[] = [];
  const today = new Date();
  // Anchor to UTC midnight of today
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  for (let i = 6; i >= 0; i--) {
    const d = new Date(utcToday);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dateKeyUTC(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

function bucketByDay(
  rows: { date: Date }[],
  days: string[]
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>(days.map((d) => [d, 0]));
  for (const row of rows) {
    const key = dateKeyUTC(row.date);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return days.map((d) => ({ date: d, count: counts.get(d) ?? 0 }));
}

export const meService = {
  /** GET /api/v1/me/history?continueWatching=&page=&pageSize= */
  async history(params: {
    userId: string;
    continueWatching: boolean;
    page: number;
    pageSize: number;
  }) {
    const where = {
      userId: params.userId,
      ...(params.continueWatching
        ? { completedAt: null, positionSec: { gt: 5 } }
        : {})
    };

    const [rows, total] = await Promise.all([
      prisma.watchHistory.findMany({
        where,
        orderBy: { watchedAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          video: true
        }
      }),
      prisma.watchHistory.count({ where })
    ]);

    // Filter out entries whose video has been soft-deleted
    const items = rows
      .filter((r) => r.video && !r.video.deletedAt)
      .map((r) => {
        const v = r.video!;
        const isOwner = v.userId === params.userId;
        const thumb = v.thumbnailUrl
          ? isOwner
            ? ownerThumbnailPath(v.id)
            : publicThumbnailPath(v.id)
          : null;
        const thumbs = v.thumbnailUrl
          ? isOwner
            ? ownerThumbnailSet(v.id)
            : publicThumbnailSet(v.id)
          : null;
        return {
          positionSec: r.positionSec,
          watchedAt: r.watchedAt,
          completedAt: r.completedAt,
          video: {
            id: v.id,
            title: v.title,
            description: v.description,
            status: v.status,
            visibility: v.visibility,
            category: v.category,
            viewCount: v.viewCount,
            duration: v.duration,
            sizeBytes: v.sizeBytes,
            createdAt: v.createdAt,
            thumbnailUrl: thumb,
            thumbnails: thumbs
          }
        };
      });

    return { items, total };
  },

  /** GET /api/v1/me/history/:videoId — returns the user's saved position for the video. */
  async historyForVideo(params: { userId: string; videoId: string }) {
    const row = await prisma.watchHistory.findUnique({
      where: {
        userId_videoId: { userId: params.userId, videoId: params.videoId }
      }
    });
    if (!row) throw new HttpError(404, "Not found");
    return {
      positionSec: row.positionSec,
      watchedAt: row.watchedAt,
      completedAt: row.completedAt
    };
  },

  /** GET /api/v1/me/stats */
  async stats(params: { userId: string }) {
    const userId = params.userId;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [uploads, viewsAgg, storageAgg, watchTimeAgg, watchRows] =
      await Promise.all([
        prisma.video.count({ where: { userId, deletedAt: null } }),
        prisma.video.aggregate({
          where: { userId, deletedAt: null },
          _sum: { viewCount: true }
        }),
        prisma.video.aggregate({
          where: { userId, deletedAt: null },
          _sum: { sizeBytes: true }
        }),
        prisma.watchHistory.aggregate({
          where: { userId },
          _sum: { positionSec: true }
        }),
        // Count watch events against this user's videos in the last 7 days,
        // grouped by day in JS.
        prisma.watchHistory.findMany({
          where: {
            watchedAt: { gte: sevenDaysAgo },
            video: { userId, deletedAt: null }
          },
          select: { watchedAt: true }
        })
      ]);

    const days = last7Days();
    const viewsLast7Days = bucketByDay(
      watchRows.map((w) => ({ date: w.watchedAt })),
      days
    );

    return {
      uploads,
      totalViews: viewsAgg._sum.viewCount ?? 0,
      totalStorageBytes: (storageAgg._sum.sizeBytes ?? BigInt(0)).toString(),
      totalWatchTimeSeconds: watchTimeAgg._sum.positionSec ?? 0,
      viewsLast7Days
    };
  },

  /** Platform-wide extras for admin stats. */
  async adminExtras() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [watchRows, uploadRows, topVideos] = await Promise.all([
      prisma.watchHistory.findMany({
        where: { watchedAt: { gte: sevenDaysAgo } },
        select: { watchedAt: true }
      }),
      prisma.video.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
        select: { createdAt: true }
      }),
      prisma.video.findMany({
        where: { deletedAt: null },
        orderBy: { viewCount: "desc" },
        take: 5,
        include: { user: { select: { email: true } } }
      })
    ]);

    const days = last7Days();
    const viewsLast7Days = bucketByDay(
      watchRows.map((w) => ({ date: w.watchedAt })),
      days
    );
    const uploadsLast7Days = bucketByDay(
      uploadRows.map((u) => ({ date: u.createdAt })),
      days
    );

    const topVideosMapped = topVideos.map((v) => ({
      id: v.id,
      title: v.title,
      viewCount: v.viewCount,
      ownerEmail: v.user?.email ?? null
    }));

    return { viewsLast7Days, uploadsLast7Days, topVideos: topVideosMapped };
  }
};
