import {
  ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps,
  aws_apprunner as apprunner, aws_cloudwatch as cw, aws_dynamodb as ddb, aws_iam as iam, aws_lambda as lambda,
  aws_lambda_nodejs as nodejs, aws_logs as logs, aws_s3 as s3, aws_scheduler as scheduler, aws_secretsmanager as sm,
} from "aws-cdk-lib";
import type { Construct } from "constructs";
import { join } from "node:path";
import { Ec2Host } from "./ec2-host";

export interface KaiseHoProps extends StackProps {
  repositoryUrl: string;
  branch: string;
  /** "ec2" (default: EC2 + CloudFront, no Docker needed) or "apprunner" (needs githubConnectionArn). */
  hosting: "ec2" | "apprunner" | "none";
  /** App Runner → GitHub connection (only for hosting=apprunner). */
  githubConnectionArn: string;
  appRunnerRuntime: string;
}

/**
 * KaiseHo on AWS, region ap-south-1 (Mumbai) so family data stays in India (plan.md Section 16).
 *   DynamoDB (single table, TTL purges transcripts) · S3 (digests) · Secrets Manager (API keys)
 *   EventBridge Scheduler group + role → job-runner Lambda → Ek Call server on App Runner
 *   Bedrock (InvokeModel) · CloudWatch dashboard. Least-privilege IAM throughout.
 */
export class KaiseHoStack extends Stack {
  constructor(scope: Construct, id: string, props: KaiseHoProps) {
    super(scope, id, props);
    Tags.of(this).add("project", "kaiseho");

    // ---------- data ----------
    const table = new ddb.TableV2(this, "Table", {
      tableName: "kaiseho_main",
      partitionKey: { name: "pk", type: ddb.AttributeType.STRING },
      sortKey: { name: "sk", type: ddb.AttributeType.STRING },
      globalSecondaryIndexes: [{ indexName: "gsi1", partitionKey: { name: "gsi1pk", type: ddb.AttributeType.STRING }, sortKey: { name: "gsi1sk", type: ddb.AttributeType.STRING } }],
      billing: ddb.Billing.onDemand(),
      timeToLiveAttribute: "ttl", // raw transcripts expire (privacy: deleted after 24 h)
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: ddb.TableEncryptionV2.awsManagedKey(),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const bucket = new s3.Bucket(this, "Assets", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [{ prefix: "digests/", expiration: Duration.days(90) }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // API keys live here (filled in once from the console or CLI; see docs/aws-runbook.md).
    const secret = new sm.Secret(this, "ServerSecret", {
      secretName: "kaiseho/server",
      description: "KaiseHo server secrets: INTERNAL_TOKEN, MCP_AGENT_TOKEN, FAMILY_TOKEN_DEMO, ELEVENLABS_*, TELEGRAM_*, TWILIO_*",
      generateSecretString: { secretStringTemplate: JSON.stringify({}), generateStringKey: "INTERNAL_TOKEN", excludePunctuation: true, passwordLength: 48 },
    });

    // ---------- scheduling: EventBridge Scheduler → job runner Lambda ----------
    const jobRunnerName = "kaiseho-job-runner";
    const serverUrlParam = this.node.tryGetContext("serverUrl") as string | undefined;
    const jobRunner = new nodejs.NodejsFunction(this, "JobRunner", {
      functionName: jobRunnerName,
      entry: join(import.meta.dirname, "../lambda/job-runner.ts"),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logGroup: new logs.LogGroup(this, "JobRunnerLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
      environment: { SECRET_ARN: secret.secretArn, SERVER_URL: serverUrlParam ?? "https://set-after-first-deploy.example" }, // overwritten below when hosting is known
      bundling: { minify: true, target: "node22", format: nodejs.OutputFormat.ESM, externalModules: ["@aws-sdk/*"] },
    });
    secret.grantRead(jobRunner);

    new scheduler.CfnScheduleGroup(this, "ScheduleGroup", { name: "kaiseho" });
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com", { conditions: { StringEquals: { "aws:SourceAccount": this.account } } }),
      description: "EventBridge Scheduler invokes the KaiseHo job runner",
    });
    jobRunner.grantInvoke(schedulerRole);

    // ---------- server role (App Runner instance role) ----------
    const serverRole = new iam.Role(this, "ServerRole", {
      assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"), new iam.ServicePrincipal("ec2.amazonaws.com")),
      description: "Ek Call server: its table, its bucket, its schedules, one Bedrock family, its secret",
    });
    table.grantReadWriteData(serverRole);
    bucket.grantReadWrite(serverRole);
    secret.grantRead(serverRole);
    serverRole.addToPolicy(new iam.PolicyStatement({
      actions: ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule", "scheduler:GetSchedule"],
      resources: [this.formatArn({ service: "scheduler", resource: "schedule", resourceName: "kaiseho/*" })],
    }));
    serverRole.addToPolicy(new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [schedulerRole.roleArn], conditions: { StringEquals: { "iam:PassedToService": "scheduler.amazonaws.com" } } }));
    serverRole.addToPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["arn:aws:bedrock:*::foundation-model/*", this.formatArn({ service: "bedrock", resource: "inference-profile", resourceName: "*" })],
    }));

    // ---------- server: App Runner from this GitHub repo ----------
    const secretKeys = ["INTERNAL_TOKEN", "MCP_AGENT_TOKEN", "FAMILY_TOKEN_DEMO", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "ELEVENLABS_BRIEFING_AGENT_ID",
      "ELEVENLABS_PHONE_NUMBER_ID", "ELEVENLABS_WEBHOOK_SECRET", "ELEVENLABS_DIGEST_VOICE_ID", "TELEGRAM_BOT_TOKEN", "TELEGRAM_DEMO_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET", "DEMO_ELDER_PHONE"];
    const baseEnv: Record<string, string> = {
      DATA_STORE: "dynamo", DDB_TABLE: table.tableName, S3_BUCKET: bucket.bucketName, AWS_REGION: this.region,
      SCHEDULER: "eventbridge", SCHEDULER_GROUP: "kaiseho", SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
      JOB_RUNNER_LAMBDA_ARN: this.formatArn({ service: "lambda", resource: "function", resourceName: jobRunnerName, arnFormat: ArnFormat.COLON_RESOURCE_NAME }),
      ENABLE_DAILY_CALLS: "false", DEMO_MODE: "true", TRANSCRIPT_RETENTION_HOURS: "24", PORT: "8787",
    };
    let serviceUrl: string | undefined;
    if (props.hosting === "ec2") {
      serviceUrl = new Ec2Host(this, "Host", { role: serverRole, secret, repositoryUrl: props.repositoryUrl, branch: props.branch, env: baseEnv }).url;
    }
    if (props.hosting === "apprunner" && props.githubConnectionArn) {
      const service = new apprunner.CfnService(this, "Server", {
        serviceName: "kaiseho-server",
        sourceConfiguration: {
          autoDeploymentsEnabled: true,
          authenticationConfiguration: { connectionArn: props.githubConnectionArn },
          codeRepository: {
            repositoryUrl: props.repositoryUrl,
            sourceCodeVersion: { type: "BRANCH", value: props.branch },
            codeConfiguration: {
              configurationSource: "API",
              codeConfigurationValues: {
                runtime: props.appRunnerRuntime,
                buildCommand: "npm i -g pnpm@10 && pnpm install --frozen-lockfile --filter @kaiseho/server...",
                startCommand: "pnpm --filter @kaiseho/server start",
                port: "8787",
                runtimeEnvironmentVariables: Object.entries(baseEnv).map(([name, value]) => ({ name, value })),
                runtimeEnvironmentSecrets: secretKeys.map((k) => ({ name: k, value: `${secret.secretArn}:${k}::` })),
              },
            },
          },
        },
        instanceConfiguration: { cpu: "1 vCPU", memory: "2 GB", instanceRoleArn: serverRole.roleArn },
        healthCheckConfiguration: { protocol: "HTTP", path: "/health", interval: 10, timeout: 5 },
        // One instance: the live-event bus and SSE stream are in-process.
        autoScalingConfigurationArn: new apprunner.CfnAutoScalingConfiguration(this, "OneInstance", {
          autoScalingConfigurationName: "kaiseho-one", minSize: 1, maxSize: 1, maxConcurrency: 100,
        }).attrAutoScalingConfigurationArn,
      });
      serviceUrl = `https://${service.attrServiceUrl}`;
      new CfnOutput(this, "ServerUrl", { value: serviceUrl, description: "PUBLIC_BASE_URL: re-run pnpm setup:elevenlabs with this" });
    }

    if (serviceUrl && !serverUrlParam) jobRunner.addEnvironment("SERVER_URL", serviceUrl);

    // ---------- observability ----------
    const dash = new cw.Dashboard(this, "Dashboard", { dashboardName: "KaiseHo" });
    dash.addWidgets(
      new cw.GraphWidget({ title: "Scheduled jobs (Lambda)", left: [jobRunner.metricInvocations(), jobRunner.metricErrors()], width: 12 }),
      new cw.GraphWidget({ title: "Job runner duration", left: [jobRunner.metricDuration()], width: 12 }),
      new cw.GraphWidget({ title: "DynamoDB reads/writes", left: [table.metricConsumedReadCapacityUnits(), table.metricConsumedWriteCapacityUnits()], width: 12 }),
      new cw.GraphWidget({
        title: "Server requests / 5xx (App Runner)", width: 12,
        left: [new cw.Metric({ namespace: "AWS/AppRunner", metricName: "Requests", dimensionsMap: { ServiceName: "kaiseho-server" }, statistic: "Sum" }),
          new cw.Metric({ namespace: "AWS/AppRunner", metricName: "5xxStatusResponses", dimensionsMap: { ServiceName: "kaiseho-server" }, statistic: "Sum" })],
      }),
    );
    new cw.Alarm(this, "JobRunnerErrors", { metric: jobRunner.metricErrors({ period: Duration.minutes(5) }), threshold: 1, evaluationPeriods: 1, alarmDescription: "A scheduled call/reminder failed to reach the server" });

    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "SecretArn", { value: secret.secretArn, description: "Fill in the API keys here" });
    new CfnOutput(this, "SchedulerRoleArn", { value: schedulerRole.roleArn });
    new CfnOutput(this, "JobRunnerArn", { value: jobRunner.functionArn });
  }
}
