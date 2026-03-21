import { DynamoDBClient, DescribeTableCommand, CreateTableCommand, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';
import dotenv from 'dotenv';
dotenv.config();

const TABLE_NAME = 'TheHolyGrail-Applications';
const PROFILE = process.env.AWS_PROFILE || 'TheHolyGrail';
const REGION = process.env.AWS_REGION || 'eu-north-1';

const client = new DynamoDBClient({
  region: REGION,
  credentials: fromIni({ profile: PROFILE }),
});

async function tableExists() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function createTable() {
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    AttributeDefinitions: [
      { AttributeName: 'applicationId', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'dateFound', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'applicationId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'status-index',
        KeySchema: [{ AttributeName: 'status', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'dateFound-index',
        KeySchema: [{ AttributeName: 'dateFound', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  console.log(`Table "${TABLE_NAME}" created. Waiting for active status...`);

  let active = false;
  while (!active) {
    await new Promise(r => setTimeout(r, 2000));
    const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    active = Table.TableStatus === 'ACTIVE';
    process.stdout.write('.');
  }
  console.log('\nTable is active.');
}

async function enableTTL() {
  try {
    await client.send(new UpdateTimeToLiveCommand({
      TableName: TABLE_NAME,
      TimeToLiveSpecification: { Enabled: true, AttributeName: 'ttl' },
    }));
    console.log('TTL enabled on "ttl" attribute.');
  } catch (err) {
    if (err.name === 'ValidationException' && err.message.includes('already enabled')) {
      console.log('TTL already enabled.');
    } else {
      throw err;
    }
  }
}

async function main() {
  console.log(`AWS Profile: ${PROFILE} | Region: ${REGION}`);

  if (await tableExists()) {
    console.log(`Table "${TABLE_NAME}" already exists.`);
  } else {
    await createTable();
  }

  await enableTTL();
  console.log('Setup complete.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
