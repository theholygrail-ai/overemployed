import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

let _client;

function client() {
  if (!_client) {
    _client = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1' });
  }
  return _client;
}

function bucket() {
  const b = process.env.DATA_S3_BUCKET;
  if (!b) throw new Error('DATA_S3_BUCKET is not set');
  return b;
}

export function isS3DataEnabled() {
  return Boolean(process.env.DATA_S3_BUCKET);
}

export async function getJsonKey(key) {
  try {
    const out = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    const body = await out.Body.transformToString();
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function putJsonKey(key, value) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: JSON.stringify(value, null, 2),
      ContentType: 'application/json',
    })
  );
}

export async function putBinaryKey(key, buffer, contentType = 'application/octet-stream') {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export async function getBinaryKey(key) {
  try {
    const out = await client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    );
    const chunks = [];
    for await (const chunk of out.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function deleteKey(key) {
  await client().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key })
  );
}

export async function listKeys(prefix) {
  const keys = [];
  let token;
  do {
    const out = await client().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ...(token && { ContinuationToken: token }),
      })
    );
    for (const obj of out.Contents || []) {
      keys.push(obj.Key);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
