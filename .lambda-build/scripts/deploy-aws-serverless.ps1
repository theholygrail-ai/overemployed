param(
    [string]$StackName = "overemployed-serverless",
    [string]$Region = "eu-north-1"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command sam -ErrorAction SilentlyContinue)) {
    Write-Host "Install AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
}

Write-Host "Building SAM application..."
sam build --template-file sam/template.yaml
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying (add --guided for first-time)..."
sam deploy `
    --template-file sam/template.yaml `
    --stack-name $StackName `
    --region $Region `
    --capabilities CAPABILITY_IAM `
    --resolve-s3 `
    --no-confirm-changeset `
    @args

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nOutputs: aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs' --output table"
}
