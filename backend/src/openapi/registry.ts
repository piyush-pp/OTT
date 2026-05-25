import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Security schemes
// ---------------------------------------------------------------------------

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT"
});

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ErrorSchema = registry.register(
  "Error",
  z.object({ error: z.string() }).openapi({ description: "Error response" })
);

const TokenPairSchema = registry.register(
  "TokenPair",
  z.object({
    accessToken: z.string(),
    refreshToken: z.string()
  })
);

const CredentialsSchema = registry.register(
  "Credentials",
  z.object({
    email: z.string().email(),
    password: z.string().min(8)
  })
);

const RefreshSchema = registry.register(
  "RefreshRequest",
  z.object({ refreshToken: z.string().min(1) })
);

const VideoSchema = registry.register(
  "Video",
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(["UPLOADED", "PROCESSING", "READY", "FAILED"]),
    visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]),
    category: z.string().nullable(),
    featured: z.boolean(),
    progress: z.number().int(),
    duration: z.number().int().nullable(),
    sizeBytes: z.string().nullable().openapi({ description: "BigInt serialized as string" }),
    viewCount: z.number().int(),
    error: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    playbackUrl: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    userId: z.string()
  })
);

const VideoListSchema = registry.register(
  "VideoList",
  z.object({
    data: z.array(VideoSchema),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
      hasMore: z.boolean()
    })
  })
);

const UploadUrlRequestSchema = registry.register(
  "UploadUrlRequest",
  z.object({
    filename: z.string().optional(),
    contentType: z.string().optional()
  })
);

const UploadUrlResponseSchema = registry.register(
  "UploadUrlResponse",
  z.object({
    videoId: z.string(),
    inputKey: z.string(),
    uploadUrl: z.string().url()
  })
);

const CompleteUploadRequestSchema = registry.register(
  "CompleteUploadRequest",
  z.object({
    videoId: z.string(),
    title: z.string(),
    inputKey: z.string()
  })
);

const DeleteResponseSchema = registry.register(
  "DeleteResponse",
  z.object({ success: z.boolean() })
);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/signup",
  tags: ["Auth"],
  summary: "Create a new user account",
  request: {
    body: {
      content: { "application/json": { schema: CredentialsSchema } }
    }
  },
  responses: {
    201: {
      description: "Signed up",
      content: { "application/json": { schema: TokenPairSchema } }
    },
    400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    409: { description: "Email already in use", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Auth"],
  summary: "Exchange credentials for a token pair",
  request: {
    body: {
      content: { "application/json": { schema: CredentialsSchema } }
    }
  },
  responses: {
    200: { description: "Logged in", content: { "application/json": { schema: TokenPairSchema } } },
    401: { description: "Invalid credentials", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate a refresh token, returning a fresh pair",
  request: {
    body: { content: { "application/json": { schema: RefreshSchema } } }
  },
  responses: {
    200: { description: "Refreshed", content: { "application/json": { schema: TokenPairSchema } } },
    401: { description: "Invalid or expired refresh token", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "get",
  path: "/api/v1/videos",
  tags: ["Videos"],
  summary: "List the authenticated user's videos (paginated)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional()
    })
  },
  responses: {
    200: { description: "Paginated video list", content: { "application/json": { schema: VideoListSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "post",
  path: "/api/v1/videos/upload-url",
  tags: ["Videos"],
  summary: "Mint a pre-signed S3 PUT URL for direct upload",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: { content: { "application/json": { schema: UploadUrlRequestSchema } } }
  },
  responses: {
    200: { description: "Presigned URL", content: { "application/json": { schema: UploadUrlResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "post",
  path: "/api/v1/videos/complete",
  tags: ["Videos"],
  summary: "Finalize an upload and enqueue transcoding",
  description:
    "Accepts an optional `Idempotency-Key` header. Replaying the same key within 24 hours returns the cached response.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: z.object({
      "idempotency-key": z.string().optional().openapi({ description: "Optional client-supplied idempotency key" })
    }),
    body: { content: { "application/json": { schema: CompleteUploadRequestSchema } } }
  },
  responses: {
    200: { description: "Video created", content: { "application/json": { schema: VideoSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    409: { description: "Video already exists", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "get",
  path: "/api/v1/videos/{id}",
  tags: ["Videos"],
  summary: "Fetch a video by ID",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: { description: "Video", content: { "application/json": { schema: VideoSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } }
  }
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/videos/{id}",
  tags: ["Videos"],
  summary: "Soft-delete a video (S3 assets removed immediately, DB row preserved with deletedAt)",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: DeleteResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } }
  }
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

let cachedDoc: ReturnType<OpenApiGeneratorV3["generateDocument"]> | null = null;

export function getOpenApiDocument() {
  if (cachedDoc) return cachedDoc;
  const generator = new OpenApiGeneratorV3(registry.definitions);
  cachedDoc = generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "OTT Platform API",
      version: "1.0.0",
      description: "Video upload, transcoding, and playback API."
    },
    servers: [{ url: "http://localhost:4000", description: "Local dev" }]
  });
  return cachedDoc;
}
