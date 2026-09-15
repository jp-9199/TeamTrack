# TeamTrack Production Deployment Adapter

## 1. Architecture

TeamTrack is a monorepo consisting of:
- **Backend**: Node.js Express service for API and WebSockets.
- **Web**: Next.js application for frontend.
- **Database**: PostgreSQL 16+.
- **Cache / Rate Limiting**: Redis.
- **Reverse Proxy**: Caddy (for routing, TLS, and security headers).
- **Storage**: S3-compatible object storage (e.g., AWS S3, MinIO).

The `infrastructure/` directory provides provider-neutral Dockerfiles and a `docker-compose.yml` that can be deployed to any Docker-compatible hosting environment.

## 2. Prerequisites
- Docker & Docker Compose
- PostgreSQL 16+ instance
- Redis 7+ instance
- S3 Bucket with appropriate IAM roles/credentials.
- Domain name (`YOUR_DOMAIN`) configured with DNS pointing to your load balancer or host.

## 3. Environment Variables
Copy `.env.example` to `.env` and fill in the `REQUIRED PRODUCTION CONFIGURATION` section. 
**Never commit the `.env` file to version control.**

## 4. Docker Deployment
If deploying via raw Docker Compose on a single node (e.g. EC2, Hetzner, DigitalOcean):
```bash
# Export your domain name for Caddy to automatically provision TLS
export SITE_ADDRESS=YOUR_DOMAIN
export CADDY_ENVIRONMENT=production

# Start the stack
docker-compose -f infrastructure/docker-compose.yml up -d
```

## 5. PostgreSQL Security
- Keep PostgreSQL isolated in a private VPC or network.
- Use TLS for connections.
- Ensure the application user has least privilege (no superuser access).

## 6. Migrations
Migrations are executed deterministically via the `npm run migrate` script.
**In CI/CD:** The deployment workflow (`.github/workflows/deploy.yml`) handles this safely.
**Manual execution:**
```bash
# Using the backend docker container
docker exec teamtrack_backend npm run migrate
```

## 7. TLS and Security
Caddy automatically provisions Let's Encrypt certificates for the configured `SITE_ADDRESS`. 
All standard security headers (HSTS, CSP, X-Frame-Options) are applied via Caddy.

## 8. WebRTC / Meetings
- Deploying WebRTC requires STUN/TURN servers to traverse NAT. 
- You must provision an external TURN server (e.g. Coturn) or use a managed service (e.g. Twilio Network Traversal).
- Without TURN, users behind symmetric NATs will fail to connect.

## 9. Limitations
- **Actual Provider**: Currently, no specific cloud provider (e.g. AWS ECS) or platform (Vercel/Render) adapter is configured. 
- **Monitoring**: The `/health` and `/live` probes exist, but no external Prometheus/Grafana adapter is configured.
- **Deployment Action**: The `deploy.yml` GitHub Action validates the deployment but stops short of executing a live push since `DEPLOY_TARGET` is intentionally not configured.
