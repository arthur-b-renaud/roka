/**
 * S3 client for SeaweedFS (server-side only).
 * Used by API routes for file upload/download.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.S3_BUCKET ?? "roka";

const s3Config = {
  region: "us-east-1" as const,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
  forcePathStyle: true,
};

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  ...s3Config,
});

/** S3 client for presigned URLs — uses S3_PUBLIC_ENDPOINT so the browser can fetch (e.g. localhost:8333 in Docker). */
const s3Presign =
  process.env.S3_PUBLIC_ENDPOINT &&
  process.env.S3_PUBLIC_ENDPOINT !== process.env.S3_ENDPOINT
    ? new S3Client({
        endpoint: process.env.S3_PUBLIC_ENDPOINT,
        ...s3Config,
      })
    : s3;

let bucketReady = false;

/** Idempotent bucket creation on first use. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  bucketReady = true;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await ensureBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 900
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Presign, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
