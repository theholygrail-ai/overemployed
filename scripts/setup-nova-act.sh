#!/bin/bash
# Nova Act apply is AWS-only: IAM credentials, workflow definition in us-east-1, Playwright inside the API container.
# EC2: use Docker Compose (`docker compose up -d --build api`) and set `NOVA_ACT_WORKFLOW_DEFINITION_NAME` in `.env`.

set -e
echo "=== Overemployed: Nova Act (AWS) ==="
echo ""
echo "1) Register a workflow definition in us-east-1 (console, CDK, or Nova Act CLI — see nova-act-samples)."
echo "2) Set NOVA_ACT_WORKFLOW_DEFINITION_NAME in .env (and DATA_S3_BUCKET for CV presigns)."
echo "3) Grant IAM nova-act:* API actions used by the API plus CloudWatch Logs read; see sam/template.yaml."
echo "4) Verify: NOVA_ACT_WORKFLOW_DEFINITION_NAME=your_name npm run ensure:nova-workflow"
echo ""
echo "Optional: probe from a running API container:"
echo "  docker compose exec -T api node -e \"import('./server/services/automation/novaActAwsService.js').then(async m=>console.log(await m.probeNovaActAws()))\""
echo "=== Done ==="
