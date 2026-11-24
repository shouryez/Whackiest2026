import {
  CfnOutput, Duration, Stack,
  aws_cloudfront as cf, aws_cloudfront_origins as origins, aws_ec2 as ec2, aws_iam as iam, type aws_secretsmanager as sm,
} from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * Docker-free hosting for the Ek Call server (default): one small ARM EC2 instance in
 * ap-south-1 running the server under systemd, with CloudFront in front for a free HTTPS URL
 * (ElevenLabs MCP + webhooks need HTTPS). Caching disabled, all headers/methods forwarded,
 * so MCP Streamable HTTP, signed webhooks and SSE pass straight through.
 * Access is via SSM Session Manager (no SSH keys, no open port 22).
 */
export interface Ec2HostProps {
  role: iam.Role;
  secret: sm.ISecret;
  repositoryUrl: string;
  branch: string;
  env: Record<string, string>;
}

export class Ec2Host extends Construct {
  readonly url: string;

  constructor(scope: Construct, id: string, props: Ec2HostProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 1, natGateways: 0, subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC }] });
    const sg = new ec2.SecurityGroup(this, "Sg", { vpc, description: "Ek Call server: port 8787 for CloudFront", allowAllOutbound: true });
    // Every route is token- or HMAC-protected; only CloudFront needs to reach 8787.
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8787), "CloudFront origin (HTTP)");

    props.role.assumeRolePolicy?.addStatements(new iam.PolicyStatement({ actions: ["sts:AssumeRole"], principals: [new iam.ServicePrincipal("ec2.amazonaws.com")] }));
    props.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    const envLines = Object.entries(props.env).map(([k, v]) => `${k}=${v}`).join("\n");
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "dnf install -y git tar xz jq",
      // Node 22 (ARM64) from nodejs.org
      "cd /tmp && curl -fsSLO https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-arm64.tar.xz",
      "tar -xJf node-v22.12.0-linux-arm64.tar.xz -C /usr/local --strip-components=1",
      "npm i -g pnpm@10",
      "useradd -r -m -d /opt/kaiseho kaiseho || true",
      `sudo -u kaiseho git clone --depth 1 -b ${props.branch} ${props.repositoryUrl} /opt/kaiseho/app || (cd /opt/kaiseho/app && sudo -u kaiseho git pull)`,
      // Non-secret config
      `cat > /opt/kaiseho/base.env <<'EOF'\n${envLines}\nEOF`,
      // Secrets → .env at boot and on every deploy (never stored in user data or git)
      `cat > /opt/kaiseho/update.sh <<'EOF'
#!/bin/bash
set -euo pipefail
cd /opt/kaiseho/app
sudo -u kaiseho git pull --ff-only
sudo -u kaiseho pnpm install --frozen-lockfile --filter @kaiseho/server...
SECRET=$(aws secretsmanager get-secret-value --region ${stack.region} --secret-id ${props.secret.secretArn} --query SecretString --output text)
{ cat /opt/kaiseho/base.env; echo "$SECRET" | jq -r 'to_entries[] | "\\(.key)=\\(.value)"'; } > apps/server/.env
chown kaiseho apps/server/.env && chmod 600 apps/server/.env
systemctl restart kaiseho
EOF`,
      "chmod +x /opt/kaiseho/update.sh",
      `cat > /etc/systemd/system/kaiseho.service <<'EOF'
[Unit]
Description=Ek Call server (KaiseHo)
After=network-online.target
[Service]
User=kaiseho
WorkingDirectory=/opt/kaiseho/app/apps/server
ExecStart=/usr/local/bin/pnpm start
Restart=always
RestartSec=3
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF`,
      "systemctl daemon-reload && systemctl enable kaiseho",
      "/opt/kaiseho/update.sh",
    );

    const instance = new ec2.Instance(this, "Server", {
      vpc, securityGroup: sg, role: props.role,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 }),
      blockDevices: [{ deviceName: "/dev/xvda", volume: ec2.BlockDeviceVolume.ebs(20, { encrypted: true }) }],
      userData, userDataCausesReplacement: false, requireImdsv2: true,
    });

    const dist = new cf.Distribution(this, "Cdn", {
      comment: "KaiseHo Ek Call server (HTTPS front door)",
      defaultBehavior: {
        origin: new origins.HttpOrigin(instance.instancePublicDnsName, { protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY, httpPort: 8787, readTimeout: Duration.seconds(60), keepaliveTimeout: Duration.seconds(60) }),
        allowedMethods: cf.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        compress: false, // keep SSE / streaming responses unbuffered
      },
      priceClass: cf.PriceClass.PRICE_CLASS_200, // includes India edge locations
    });
    this.url = `https://${dist.distributionDomainName}`;

    new CfnOutput(stack, "ServerUrl", { value: this.url, description: "PUBLIC_BASE_URL: re-run pnpm setup:elevenlabs with this" });
    new CfnOutput(stack, "InstanceId", { value: instance.instanceId, description: "Deploy updates: aws ssm send-command … /opt/kaiseho/update.sh (see runbook)" });
  }
}
