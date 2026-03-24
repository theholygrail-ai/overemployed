import dotenv from 'dotenv';
dotenv.config();

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'TheHolyGrail-Applications';
const TTL_DAYS = 90;

const clientConfig = {
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1',
};
if (process.env.AWS_PROFILE && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  clientConfig.credentials = fromIni({ profile: process.env.AWS_PROFILE });
}

const client = new DynamoDBClient(clientConfig);

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function putApplication(item) {
  const now = new Date();
  const record = {
    applicationId: item.applicationId || uuidv4(),
    roleTitle: item.roleTitle,
    company: item.company,
    jobLink: item.jobLink,
    source: item.source,
    tailoredCV: item.tailoredCV,
    status: item.status || 'new',
    matchScore: item.matchScore,
    dateFound: item.dateFound || now.toISOString(),
    runId: item.runId,
    tags: item.tags || [],
    ttl: item.ttl || Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: record }));
  return record;
}

export async function getApplication(applicationId) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { applicationId } })
  );
  return Item;
}

export async function queryByStatus(status) {
  const { Items } = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'status-index',
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
    })
  );
  return Items;
}

export async function getAllApplications() {
  const items = [];
  let lastKey;

  do {
    const { Items, LastEvaluatedKey } = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );
    items.push(...(Items || []));
    lastKey = LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export async function updateApplicationStatus(applicationId, newStatus) {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { applicationId },
      UpdateExpression: 'SET #s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': newStatus },
      ReturnValues: 'ALL_NEW',
    })
  );
  return Attributes;
}

/**
 * Set status and attach apply-proof metadata (automation success verification screenshots).
 * @param {object} applyProof - { capturedAt, shots: [{ label, index }], engine? }
 */
export async function updateApplicationStatusWithApplyProof(applicationId, newStatus, applyProof) {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { applicationId },
      UpdateExpression: 'SET #s = :status, applyProof = :proof',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':proof': applyProof,
      },
      ReturnValues: 'ALL_NEW',
    })
  );
  return Attributes;
}

export async function deleteApplication(applicationId) {
  await docClient.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { applicationId } })
  );
}

export async function findByJobLink(jobLink) {
  const { Items } = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'jobLink = :link',
      ExpressionAttributeValues: { ':link': jobLink },
    })
  );
  return Items?.[0] || null;
}

export async function getMetrics() {
  const items = await getAllApplications();
  const counts = {};

  for (const item of items) {
    const s = item.status || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }

  return {
    total: items.length,
    byStatus: counts,
  };
}
