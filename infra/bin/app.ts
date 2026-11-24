import { App } from "aws-cdk-lib";
import { KaiseHoStack } from "../lib/stack";

const app = new App();
const region = (app.node.tryGetContext("region") as string) || "ap-south-1";

new KaiseHoStack(app, "KaiseHo", {
  env: { region, account: process.env.CDK_DEFAULT_ACCOUNT },
  description: "KaiseHo / Ek Call: daily AI check-in calls for elderly parents (wHACKiest 2026)",
  repositoryUrl: app.node.tryGetContext("repositoryUrl"),
  branch: app.node.tryGetContext("branch") || "main",
  hosting: (app.node.tryGetContext("hosting") as "ec2" | "apprunner" | "none") || "ec2",
  githubConnectionArn: app.node.tryGetContext("githubConnectionArn") || "",
  appRunnerRuntime: app.node.tryGetContext("appRunnerRuntime") || "NODEJS_22",
});
