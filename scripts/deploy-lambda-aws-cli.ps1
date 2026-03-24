# Deploy Zip-based Lambdas using AWS CLI only (no SAM).
# Prerequisites: AWS CLI configured, node, and S3 bucket for packages >50MB.
#
# Defaults match account discovered for this project; override with parameters.
param(
    [string]$Region = "eu-north-1",
    [string]$Bucket = "overemployed-data-974560757141",
    [string]$HttpApiFunction = "overemployed-http-api",
    [string]$WorkerFunction = "overemployed-worker",
    [string]$Profile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$aws = { param($Args) if ($Profile) { aws $Args --profile $Profile } else { aws $Args } }

Write-Host ">>> Building lambda-deploy.zip..."
node scripts/build-lambda-zip.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$zip = Join-Path $Root "lambda-deploy.zip"
if (-not (Test-Path $zip)) { throw "Missing $zip" }

$key = "lambda-deploys/lambda-deploy-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
Write-Host ">>> Uploading to s3://$Bucket/$key ..."
if ($Profile) {
    aws s3 cp $zip "s3://$Bucket/$key" --region $Region --profile $Profile
} else {
    aws s3 cp $zip "s3://$Bucket/$key" --region $Region
}

Write-Host ">>> Updating $HttpApiFunction ..."
if ($Profile) {
    aws lambda update-function-code --function-name $HttpApiFunction --s3-bucket $Bucket --s3-key $key --region $Region --profile $Profile
} else {
    aws lambda update-function-code --function-name $HttpApiFunction --s3-bucket $Bucket --s3-key $key --region $Region
}

Write-Host ">>> Updating $WorkerFunction ..."
if ($Profile) {
    aws lambda update-function-code --function-name $WorkerFunction --s3-bucket $Bucket --s3-key $key --region $Region --profile $Profile
} else {
    aws lambda update-function-code --function-name $WorkerFunction --s3-bucket $Bucket --s3-key $key --region $Region
}

Write-Host "Done. S3 key: $key"
