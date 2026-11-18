# copiloto-vagas

An AI copilot for my own job search: it analyzes job posts against my resume and tracks each application through the hiring funnel.

**Status:** early development. The domain is being built first, with no cloud dependencies. The planned target is serverless on AWS (Lambda, API Gateway, DynamoDB, SQS, Bedrock), provisioned with Terraform.

## Architecture

Ports and adapters (hexagonal). The domain defines the interfaces it needs, and infrastructure implements them, so business rules run the same in a Lambda, a script or a unit test. A lint rule fails the build if the domain imports anything from outside it.

```
apps/api/src/
├── domain/        # entities, rules and ports (no I/O, no SDKs)
├── application/   # use cases that orchestrate the domain
├── adapters/      # implementations of the ports (DynamoDB, SQS, Bedrock)
└── presentation/  # HTTP handlers; translates domain error codes into status codes
```

Architecture decisions are recorded in [docs/decisions.md](docs/decisions.md).

## Development

Requires Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm test        # Vitest, all workspaces
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint with type-aware rules
```

### Analyze a job post (local, calls Amazon Bedrock)

Put the job post and your resume as text files in `local/` (ignored by Git), sign in with `aws login`, then:

```bash
BEDROCK_MODEL_ID=<model or inference profile id> pnpm analyze local/job.txt local/resume.txt
```

It prints the validated analysis and the tokens used. No keys in code: the AWS SDK finds credentials through its default provider chain.

## License

MIT
