import { DeleteObjectsCommand, ListObjectsV2Command, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../utils/env.js";

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  }
});

export async function presignPutObject(params: {
  bucket: string;
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
}) {
  const cmd = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: params.expiresInSeconds ?? 60 * 10 });
  return url;
}

export async function deleteByPrefix(params: { bucket: string; prefix: string }) {
  let continuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: params.bucket,
        Prefix: params.prefix,
        ContinuationToken: continuationToken
      })
    );

    const objects = (list.Contents ?? [])
      .map((entry) => entry.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));

    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: params.bucket,
          Delete: { Objects: objects, Quiet: true }
        })
      );
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
}
