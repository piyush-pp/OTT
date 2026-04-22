import { createWriteStream, createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { s3 } from "./client.js";

export async function downloadToFile(params: { bucket: string; key: string; filePath: string }) {
  await mkdir(dirname(params.filePath), { recursive: true });
  const res = await s3.send(new GetObjectCommand({ Bucket: params.bucket, Key: params.key }));
  if (!res.Body) throw new Error("S3 GetObject returned empty body");
  const body = res.Body as unknown as NodeJS.ReadableStream;

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(params.filePath);
    body.pipe(out);
    out.on("finish", () => resolve());
    out.on("error", reject);
    body.on("error", reject);
  });
}

export async function uploadFile(params: { bucket: string; key: string; filePath: string; contentType?: string }) {
  const input: PutObjectCommandInput = {
    Bucket: params.bucket,
    Key: params.key,
    Body: createReadStream(params.filePath),
    ContentType: params.contentType
  };

  // Use multipart upload for large segments too.
  const uploader = new Upload({ client: s3, params: input });
  await uploader.done();
}

export async function listPrefix(params: { bucket: string; prefix: string }) {
  const keys: string[] = [];
  let ContinuationToken: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: params.bucket,
        Prefix: params.prefix,
        ContinuationToken
      })
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

export async function putSmallObject(params: { bucket: string; key: string; body: string; contentType: string }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType
    })
  );
}
