import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

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
