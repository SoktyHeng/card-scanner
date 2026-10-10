import { verifyDeployment } from "./deployment-checks";

verifyDeployment(process.argv[2] ?? "").then(() => {
  console.log("Manual checks still required: proxy overwrite rules, platform timeouts, edge abuse limits, Auth settings, physical devices, screen readers and real photos.");
}).catch(() => {
  console.error("Deployment verification failed. Confirm the HTTPS origin, security headers, private caching and API denial behavior. No response bodies or credentials are logged.");
  process.exitCode = 1;
});
