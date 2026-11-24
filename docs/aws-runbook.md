# KaiseHo on AWS: deployment runbook (Phase 4)

Everything lives in **ap-south-1 (Mumbai)**, so family data stays in India.
The stack is in [`infra/`](../infra) (AWS CDK, TypeScript). No Docker is needed.

```
EventBridge Scheduler ──► Lambda kaiseho-job-runner ──► Ek Call server (EC2 t4g.small, systemd)
   daily calls · reminders · callbacks              ▲              │  DynamoDB kaiseho_main (TTL purges transcripts)
   retries · emergency repeats · digests            │              │  S3 (digest MP3s, private, 90-day expiry)
                                     CloudFront (HTTPS) ◄── ElevenLabs MCP + webhooks · dashboard · Claude
                                                                   │  Secrets Manager kaiseho/server (API keys)
                                                                   └  Bedrock (optional LLM) · CloudWatch dashboard + alarm
```

| Resource | Why |
|---|---|
| DynamoDB `kaiseho_main` (on-demand, PITR, encrypted) | All entities, single-table design; `ttl` deletes raw transcripts |
| S3 bucket (block public, SSE, TLS only) | Weekly digest MP3s |
| Secrets Manager `kaiseho/server` | API keys and tokens; never in git or user data |
| EventBridge Scheduler group `kaiseho` + role | Daily check-ins (`cron`, Asia/Kolkata), one-time reminders/retries (`at()`, auto-delete) |
| Lambda `kaiseho-job-runner` (ARM, Node 22) | Forwards each job to `/internal/jobs/run` |
| EC2 t4g.small + CloudFront | The server, with a free HTTPS URL; access via SSM only (no SSH) |
| CloudWatch dashboard **KaiseHo** + alarm | Jobs, errors, DynamoDB, requests |

> App Runner is in AWS maintenance mode (since March 2026), so the default hosting is EC2 + CloudFront.
> `-c hosting=apprunner -c githubConnectionArn=…` is still available if your account can use it.

## 1. One-time setup (≈15 min)
1. **AWS account** → sign in → switch the region (top right) to **Asia Pacific (Mumbai) ap-south-1**.
2. **Access key for the CLI:** IAM → Users → *Create user* `kaiseho-deployer` → attach **AdministratorAccess** (hackathon; scope down later) → *Security credentials* → *Create access key* (CLI).
3. **Install AWS CLI v2** (Windows MSI from aws.amazon.com/cli), then:
   ```bash
   aws configure          # paste the key + secret, region ap-south-1, output json
   aws sts get-caller-identity
   ```
4. *(Optional, for AI summaries via Bedrock)* Bedrock console → **Model access** → request a fast model (e.g. a Claude Haiku-class or Amazon Nova model available in ap-south-1). Note its model ID or inference-profile ID.

## 2. Deploy
```bash
pnpm i
cd infra
pnpm exec cdk bootstrap        # once per account/region
pnpm run deploy                # ~10 min; prints ServerUrl, SecretArn, InstanceId …
```

## 3. Put the keys in Secrets Manager
Your local `apps/server/.env` already has them:
```bash
pnpm --filter @kaiseho/infra secrets:push     # copies INTERNAL_TOKEN, ElevenLabs, Twilio-related, Telegram … (prints names only)
```
Then reload the server (it pulls code + secrets and restarts):
```bash
aws ssm send-command --instance-ids <InstanceId> --document-name AWS-RunShellScript \
  --parameters commands=/opt/kaiseho/update.sh --region ap-south-1
```
Use the same command after every `git push` to deploy new code.

## 4. Point everything at the cloud URL
```bash
# apps/server/.env
PUBLIC_BASE_URL=<ServerUrl from the deploy output>
pnpm setup:elevenlabs          # moves the MCP servers + webhook to the CloudFront URL
```
Dashboard: deploy `apps/dashboard` to Vercel with `NEXT_PUBLIC_API_URL=<ServerUrl>` and `NEXT_PUBLIC_FAMILY_TOKEN=<FAMILY_TOKEN_DEMO>`.

## 5. Acceptance (plan.md Phase 4)
```bash
curl <ServerUrl>/health                                      # "dataStore":"dynamo"
curl -X POST -H "Authorization: Bearer <INTERNAL_TOKEN>" "<ServerUrl>/internal/test/schedule-call?minutes=2"
# → {"backend":"eventbridge", …}: 2 minutes later the phone rings on its own (a ~45 s quick test call)
```
Check **CloudWatch → Dashboards → KaiseHo** (job invocations) and **EventBridge → Scheduler → kaiseho** (the one-time schedule deletes itself after running).
Daily check-ins: a `daily-<elderId>` schedule is created/updated automatically when consent is recorded or the time changes.

## Cost (approx., ap-south-1)
EC2 t4g.small ≈ $12/month (free-tier accounts: t4g.small trial hours may apply) · DynamoDB, Lambda, Scheduler, S3, CloudFront: cents at hackathon scale · Bedrock: per call.
**After the event:** `pnpm exec cdk destroy` (the table and bucket are retained on purpose; delete them by hand if you want everything gone).
