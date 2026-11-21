# Infra lens

For infrastructure as code, containers, deployment manifests and CI/CD pipelines.

## Signals
Terraform (`*.tf`), Helm charts (`Chart.yaml`), Dockerfiles and Compose files, Kubernetes manifests (YAML with top-level `apiVersion` and `kind`), CI configuration (GitHub Actions, GitLab CI, CircleCI, Jenkins).

## Patterns to inventory
Find two or three real examples of each that are relevant to the change, with file paths:
- **IaC layout:** modules, how resources are grouped and named, state backends, provider versions
- **Environments:** which environments exist, how config differs between them, how a change is promoted from one to the next
- **Secrets and config:** where secrets live (vault, cloud secret manager, CI secrets), how apps receive config and environment variables
- **Containers:** base images, multi-stage builds, how images are tagged and pushed
- **Kubernetes and Helm:** workload kinds used, values files per environment, resource requests and limits, probes
- **CI/CD:** pipeline stages, required checks, who or what can deploy, manual approvals
- **Networking and access:** ingress, DNS, security groups or network policies, IAM roles and service accounts
- **Observability:** dashboards, alerts and log routing defined as code, and who receives the alerts

## Gaps to check
- Which environments does this change, and in what order?
- How is it rolled back, and does rollback lose data?
- Does applying it cause downtime or a restart, and is that acceptable?
- Which secrets or permissions are new, and who grants them?
- What does it cost per month, and who approves the cost?
- If it breaks at night, which alert fires and who gets it?

## Scale triggers
Check the repo first (existing resource sizes, autoscaling settings, dashboards and runbooks in docs). Ask only what the repo can't answer, one question at a time, and say what the answer changes.

| Trigger | Ask |
|---|---|
| New always-on resource (database, cache, queue, cluster node pool) | What load must it handle at peak, and what does the smallest size that handles it cost? |
| Autoscaling added or changed | What are the minimum and maximum replicas, and what happens at the maximum? |
| New data store or bucket | How much data in a year, and how long must it be kept? |
| Pipeline step added | How long does it add to every build, and can it run in parallel? |
| Traffic moved between services or regions | What's the peak request rate, and can it be shifted gradually? |

## Design sections
- **Resources and environments:** each resource created, changed or removed, per environment, with its size and owner
- **Rollout and rollback:** the order of applies and deploys, what is verified after each, and the exact steps to roll back

## Failure handling
Map each failure scenario to: what happens when the plan or apply fails partway, how drift between code and reality is detected, what a partial rollout leaves running, and which alert or check catches it.

## Test mapping
| Scenario kind | Test |
|---|---|
| Resource definitions are valid | `terraform validate`, `helm lint`, `kubectl --dry-run=server` or the repo's equivalent, in CI |
| The change does what the design says | Plan output reviewed (`terraform plan`, `helm diff`), attached to the review |
| Policy and security rules | Policy checks (OPA, Checkov, tfsec or the repo's equivalent), if the repo has them |
| Container builds and runs | Image build in CI, plus a container start or health check |
| Pipeline changes | CI dry run on a branch |
| Works once deployed | Smoke test after deploy to a non-production environment |
