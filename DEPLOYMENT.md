# SimAgents Deployment Guide

This guide covers deploying SimAgents to Fly.io with PostgreSQL and Redis.

## Prerequisites

- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
- Fly.io account (sign up at https://fly.io)
- GitHub repository with Actions enabled

## Architecture Overview

```
                    +------------------+
                    |   Fly.io Edge    |
                    |   (Load Balancer)|
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
      +-------v------+ +-----v------+ +----v-------+
      | Server App   | | Server App | | Server App |
      | (Instance 1) | | (Instance 2)| | (Instance 3)|
      +-------+------+ +-----+------+ +-----+------+
              |              |              |
              +--------------+--------------+
                             |
              +--------------+--------------+
              |                             |
      +-------v--------+          +--------v-------+
      |  Fly Postgres  |          |   Fly Redis    |
      |  (Primary +    |          |   (Upstash)    |
      |   Read Replica)|          |                |
      +----------------+          +----------------+
```

## Initial Setup

### 1. Create Fly.io Application

```bash
# Login to Fly.io
fly auth login

# Navigate to server directory
cd apps/server

# Create the app (skip if using CI/CD)
fly apps create simagents-server
```

### 2. Provision PostgreSQL Database

```bash
# Create Fly Postgres cluster
fly postgres create \
  --name simagents-db \
  --region iad \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 10

# Attach to your app (this sets DATABASE_URL secret automatically)
fly postgres attach simagents-db --app simagents-server
```

### 3. Provision Redis (Upstash)

```bash
# Create Upstash Redis through Fly.io
fly redis create \
  --name simagents-redis \
  --region iad \
  --no-eviction

# Note the connection URL provided
# Set it as a secret:
fly secrets set REDIS_URL="redis://default:xxx@fly-simagents-redis.upstash.io:6379" --app simagents-server
```

### 4. Configure Secrets

Set all required secrets for production:

```bash
# Navigate to server directory
cd apps/server

# LLM API Keys (set the ones you need)
fly secrets set ANTHROPIC_API_KEY="sk-ant-xxx" --app simagents-server
fly secrets set GOOGLE_API_KEY="xxx" --app simagents-server
fly secrets set OPENAI_API_KEY="sk-xxx" --app simagents-server
fly secrets set DEEPSEEK_API_KEY="xxx" --app simagents-server
fly secrets set QWEN_API_KEY="xxx" --app simagents-server
fly secrets set GLM_API_KEY="xxx" --app simagents-server
fly secrets set GROK_API_KEY="xxx" --app simagents-server

# Database and Redis (if not using fly postgres attach)
fly secrets set DATABASE_URL="postgres://user:pass@host:5432/db" --app simagents-server
fly secrets set REDIS_URL="redis://host:6379" --app simagents-server

# List all secrets (names only)
fly secrets list --app simagents-server
```

### 5. Deploy

```bash
# Deploy from apps/server directory
cd apps/server
fly deploy

# Or deploy from root with config path
fly deploy --config apps/server/fly.toml
```

## GitHub Actions CI/CD Setup

### 1. Add Repository Secrets

Go to your GitHub repository Settings > Secrets and variables > Actions, and add:

| Secret Name | Description |
|-------------|-------------|
| `FLY_API_TOKEN` | Fly.io API token (get from `fly tokens create deploy`) |

### 2. Workflow Behavior

The deployment workflow (`.github/workflows/deploy.yml`) triggers on:
- Push to `main` branch (only when server code changes)
- Manual dispatch from GitHub Actions UI

The CI workflow (`.github/workflows/ci.yml`) runs on:
- All pushes to `main` and `develop`
- All pull requests targeting `main` or `develop`

## Environment Variables

### Required Secrets (via `fly secrets set`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `REDIS_URL` | Redis connection string (required) |
| `ANTHROPIC_API_KEY` | Claude API key (optional) |
| `GOOGLE_API_KEY` | Gemini API key (optional) |
| `OPENAI_API_KEY` | OpenAI/Codex API key (optional) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (optional) |
| `QWEN_API_KEY` | Alibaba Qwen API key (optional) |
| `GLM_API_KEY` | Zhipu GLM API key (optional) |
| `GROK_API_KEY` | xAI Grok API key (optional) |

> **Note**: At least one LLM API key is required for agent decision-making. Use `TEST_MODE=true` to run without LLM calls.

### Environment Variables (in fly.toml)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | production | Environment mode |
| `PORT` | 3000 | Server port |
| `TICK_INTERVAL_MS` | 60000 | Simulation tick interval (ms) |
| `LLM_CACHE_ENABLED` | true | Enable LLM response caching |
| `LLM_CACHE_TTL_SECONDS` | 300 | Cache TTL |

## Scaling

### Manual Scaling

```bash
# Scale to 2 instances
fly scale count 2 --app simagents-server

# Scale VM size
fly scale vm shared-cpu-2x --app simagents-server

# Scale memory
fly scale memory 1024 --app simagents-server
```

### Auto-scaling Configuration

The `fly.toml` is configured with:
- `min_machines_running = 1`: Always keep at least 1 machine
- `auto_stop_machines = "stop"`: Stop idle machines
- `auto_start_machines = true`: Start machines on demand

For max instances, use:
```bash
fly scale count 3 --app simagents-server
```

## Database Migrations

### Run Migrations

```bash
# Via Fly SSH
fly ssh console --app simagents-server -C "bunx drizzle-kit push"

# Or via proxy (from local machine)
fly proxy 5433:5432 --app simagents-db &
DATABASE_URL="postgres://user:pass@localhost:5433/simagents" bunx drizzle-kit push
```

## Monitoring & Logs

### View Logs

```bash
# Real-time logs
fly logs --app simagents-server

# Last 100 lines
fly logs --app simagents-server -n 100
```

### Health Checks

```bash
# Check app status
fly status --app simagents-server

# Check health endpoint
curl https://simagents-server.fly.dev/health

# Check detailed status
curl https://simagents-server.fly.dev/api/status
```

### Metrics Dashboard

Access Fly.io metrics at: https://fly.io/apps/simagents-server/monitoring

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Verify DATABASE_URL is set
   fly secrets list --app simagents-server

   # Check postgres status
   fly status --app simagents-db
   ```

2. **Redis Connection Failed**
   ```bash
   # Verify REDIS_URL is set correctly
   fly ssh console --app simagents-server -C "echo \$REDIS_URL"
   ```

3. **Out of Memory**
   ```bash
   # Scale up memory
   fly scale memory 1024 --app simagents-server
   ```

4. **Deploy Failed**
   ```bash
   # Check build logs
   fly logs --app simagents-server

   # Redeploy with verbose output
   fly deploy --verbose
   ```

### SSH Access

```bash
# SSH into running instance
fly ssh console --app simagents-server

# Run a command
fly ssh console --app simagents-server -C "ls -la"
```

## Rollback

```bash
# List recent releases
fly releases --app simagents-server

# Rollback to previous release
fly releases rollback --app simagents-server

# Rollback to specific version
fly releases rollback v5 --app simagents-server
```

## Cost Optimization

### Estimated Monthly Costs (Fly.io)

| Resource | Spec | Estimated Cost |
|----------|------|----------------|
| Server (1 instance) | shared-cpu-1x, 512MB | ~$3-5/month |
| PostgreSQL | Development (1 node) | ~$7/month |
| Redis (Upstash) | Free tier / Pay-as-you-go | $0-10/month |
| **Total** | | **~$10-22/month** |

### Cost Reduction Tips

1. Use `auto_stop_machines` to stop idle instances
2. Use shared-cpu instances for development
3. Use Upstash Redis free tier (10k commands/day)
4. Set appropriate volume sizes

## Frontend Deployment (Optional)

For deploying the frontend separately (e.g., to Vercel or Cloudflare Pages):

```bash
cd apps/web

# Build with production API URL
VITE_API_URL=https://simagents-server.fly.dev npm run build

# Deploy to Vercel
vercel --prod

# Or deploy to Cloudflare Pages
npx wrangler pages deploy dist
```

## Security Checklist

- [ ] All secrets stored via `fly secrets set` (not in fly.toml)
- [ ] HTTPS enforced (`force_https = true`)
- [ ] Health check endpoint exposed
- [ ] Non-root user in Dockerfile
- [ ] No sensitive data in logs
- [ ] API rate limiting configured
- [ ] CORS properly configured for production domains
