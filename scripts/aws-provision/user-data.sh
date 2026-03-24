#!/bin/bash
set -e
exec > >(tee /var/log/overemployed-bootstrap.log) 2>&1

dnf update -y
dnf install -y docker jq unzip
# AWS CLI v2 (AL2023 minimal images may omit it)
if ! command -v aws >/dev/null 2>&1; then
  curl -sS "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install -i /usr/local/aws-cli -b /usr/local/bin
fi
systemctl enable --now docker

dnf install -y docker-compose-plugin || {
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
}

REGION="eu-north-1"
BUCKET="overemployed-code-974560757141"
INSTALL="/opt/overemployed"

mkdir -p "$INSTALL/data"
cd "$INSTALL"

for i in 1 2 3 4 5 6 7 8 9 10; do
  aws sts get-caller-identity --region "$REGION" && break
  sleep 3
done

aws s3 cp "s3://${BUCKET}/releases/deploy.zip" /tmp/deploy.zip
unzip -o /tmp/deploy.zip -d "$INSTALL"
rm -f /tmp/deploy.zip

SECRET_ID="overemployed/ec2-env"
aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ID" --query SecretString --output text > /tmp/overemployed-secret.json
python3 -c "
import json
with open('/tmp/overemployed-secret.json', encoding='utf-8') as f:
    data = json.load(f)
with open('$INSTALL/.env', 'w', encoding='utf-8') as f:
    for k, v in data.items():
        f.write(f'{k}={v}\n')
"
rm -f /tmp/overemployed-secret.json

grep -q '^AWS_REGION=' "$INSTALL/.env" || echo "AWS_REGION=${REGION}" >> "$INSTALL/.env"
grep -q '^PORT=' "$INSTALL/.env" || echo "PORT=4900" >> "$INSTALL/.env"

cd "$INSTALL"
docker compose up -d --build api

chown -R ec2-user:ec2-user "$INSTALL" || true
echo "Overemployed bootstrap done."
