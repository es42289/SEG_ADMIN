# Django Plotly Map Starter (Snowflake-backed)

Routes:
- `/map/` — page with Plotly map and year slider
- `/map-data/?date=YYYY-01-01` — JSON endpoint fetching points from `WELLS.MINERALS.RAW_WELL_DATA`

Environment variables expected:
```
SF_ACCOUNT=CMZNSCB-MU47932
SF_USER=ELII
SF_WAREHOUSE=COMPUTE_WH
SF_DATABASE=WELLS
SF_SCHEMA=MINERALS
SF_ROLE=YOUR_ROLE          # optional
SF_AUTH=externalbrowser    # or key-pair/IdP per your setup
```

### File upload configuration

Set the following environment variables so the document upload APIs can talk to
Snowflake and S3:

```
SNOWFLAKE_ACCOUNT=<ACCOUNT>
SNOWFLAKE_USER=ELII
SNOWFLAKE_ROLE=APP_ROLE_MIN
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=WELLS
SNOWFLAKE_SCHEMA=MINERALS
SNOWFLAKE_PASSWORD=<PASSWORD>           # or configure SNOWFLAKE_PRIVATE_KEY_PATH
SNOWFLAKE_PRIVATE_KEY_PATH=/path/to/rsa_key.pem
SNOWFLAKE_PRIVATE_KEY_PASSPHRASE=<PASSPHRASE_IF_NEEDED>

# Standard AWS credentials must also be present so boto3 can sign requests:
AWS_ACCESS_KEY_ID=<AWS_KEY>
AWS_SECRET_ACCESS_KEY=<AWS_SECRET>
AWS_SESSION_TOKEN=<OPTIONAL_TEMP_TOKEN>
AWS_DEFAULT_REGION=us-east-2
```

The uploads API uses the private S3 bucket `seg-user-document-uploads` in the
`us-east-2` region. Grant the configured AWS IAM principal permission to `s3:*`
actions on that bucket (put, head, get, delete) so that presigned URLs work.

SQL used:
```sql
SELECT LATITUDE AS LAT, LONGITUDE AS LON, COMPLETIONDATE
FROM WELLS.MINERALS.RAW_WELL_DATA
WHERE LATITUDE IS NOT NULL
  AND LONGITUDE IS NOT NULL;
```

Forecast and economics endpoints normalize API numbers by stripping dashes
before querying `WELLS.MINERALS.FORECASTS` so that wells are not dropped when
the table stores undashed identifiers.

## Local development with Docker

The repository includes a `Dockerfile` that mirrors the runtime we use for the
Snowflake-backed Django app. The steps below let you build the image and run a
containerized development server that exposes the app at `http://localhost:8000`.

1. **Create a `.env` file**

   The Django app relies on the Snowflake credentials listed above. Store them in
   a local `.env` file so that Docker can inject them at runtime. For key-pair
   authentication place your private key on disk (for example `~/secrets/rsa_key.pem`).

   ```bash
   cat > .env <<'ENV'
   SF_ACCOUNT=your_account
   SF_USER=your_user
   SF_WAREHOUSE=COMPUTE_WH
   SF_DATABASE=WELLS
   SF_SCHEMA=MINERALS
   SF_ROLE=YOUR_ROLE
   SF_AUTH=externalbrowser   # or KEYPAIR for private key auth
   ENV
   ```

   If you are using key-pair authentication, add `SF_PRIVATE_KEY_PATH=/secrets/rsa_key.pem`
   and mount the key into the container when you run it (see below).

2. **Build the image**

   ```bash
   docker build -t seg-map-dev .
   ```

   The image installs the Python dependencies from `requirements.txt` and sets up
   `python manage.py runserver` as the default command.

3. **Run the development container**

   ```bash
   docker run --rm -it \
     --env-file .env \
     -p 8000:8000 \
     -v "$(pwd)":/app \
     -v "~/secrets/rsa_key.pem:/secrets/rsa_key.pem:ro" \
     seg-map-dev
   ```

   * The `--env-file` flag injects the Snowflake environment variables.
   * `-p 8000:8000` maps the Django dev server to your localhost.
   * `-v $(pwd):/app` bind-mounts your source tree so that code changes reload.
   * Mount the private key volume only when `SF_AUTH` uses key-pair authentication.

   When the container starts you will see the Django server logs in your terminal.
   Navigate to [http://localhost:8000/map/](http://localhost:8000/map/) to load the map.

4. **Run management commands**

   For additional Django commands (migrations, shell, etc.) you can either start
   an interactive container or exec into the running container:

   ```bash
   # example: open a Django shell in the running container named seg-map
   docker exec -it <container_id_or_name> python manage.py shell
   ```

   Alternatively, launch a one-off container that runs a specific command and
   exits:

   ```bash
   docker run --rm --env-file .env -v "$(pwd)":/app seg-map-dev \
     python manage.py showmigrations
   ```

The bind mount keeps your local file changes in sync with the running container,
while the `--rm` flag ensures that stopped containers do not accumulate. Stop the
server with `Ctrl+C` when you are done.

# AWS Fargate Deployment Guide

## Prerequisites

- AWS CLI configured with appropriate profile
- Docker installed and running
- ECR repository created: `seg-user-app`
- ECS cluster created: `seg-user-app-cluster`
- Task definition family: `seg-user-app`

## Deployment Steps

### 1. Build Docker Image

```bash
docker build -t seg-user-app .
```

### 2. Tag for ECR

```bash
docker tag seg-user-app:latest 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
```

### 3. Authenticate with ECR

```bash
aws ecr get-login-password --region us-east-1 --profile myaws | docker login --username AWS --password-stdin 983102014556.dkr.ecr.us-east-1.amazonaws.com
```

### 4. Push to ECR

```bash
docker push 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
```

### 5. Stop Current Running Task (if any)

First, get the current task ID:
```bash
aws ecs list-tasks --cluster seg-user-app-cluster --region us-east-1 --profile myaws
```

Then stop the task (replace TASK_ID with actual ID):
```bash
aws ecs stop-task --cluster seg-user-app-cluster --task TASK_ID --region us-east-1 --profile myaws
```

### 6. Start New Task

```bash
aws ecs run-task --cluster seg-user-app-cluster --task-definition seg-user-app:4 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-0c8fc60cca8c6eda9],securityGroups=[sg-05c78762d0d99d139],assignPublicIp=ENABLED}" --region us-east-1 --profile myaws
```

### 7. Get New Public IP Address

Get the new task ID from step 6 output, then:

```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks NEW_TASK_ID --region us-east-1 --profile myaws
```

Extract the `networkInterfaceId` from the output, then:

```bash
aws ec2 describe-network-interfaces --network-interface-ids NETWORK_INTERFACE_ID --region us-east-1 --profile myaws
```

The public IP will be in the `Association.PublicIp` field.

### 8. Update External Configurations

When the public IP changes, update:

1. **Snowflake Network Policy**:
   ```sql
   ALTER NETWORK POLICY streamlit_policy
     SET ALLOWED_IP_LIST = ('existing_ips', 'NEW_PUBLIC_IP');
   ```

2. **Auth0 Callback URLs**:
   Add `http://NEW_PUBLIC_IP:8000/callback/` to allowed callback URLs

## Troubleshooting

### Check Task Status
```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks TASK_ID --region us-east-1 --profile myaws
```

### View Application Logs
```bash
aws logs get-log-events --log-group-name "/ecs/seg-user-app" --log-stream-name "ecs/seg-user-app/TASK_ID" --region us-east-1 --profile myaws
```

### Common Issues

- **Out of Memory**: Task definition uses 1024MB memory. If still getting OOM errors, increase memory in task definition.
- **IP Not Allowed**: Add new public IP to Snowflake network policy
- **Auth0 Errors**: Update callback URLs with new IP address
- **Port 8000 Blocked**: Ensure security group allows inbound traffic on port 8000

## Resource IDs

- **Account ID**: 983102014556
- **ECR Repository**: 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app
- **ECS Cluster**: seg-user-app-cluster  
- **Task Definition**: seg-user-app:4
- **Subnet**: subnet-0c8fc60cca8c6eda9
- **Security Group**: sg-05c78762d0d99d139
- **VPC**: vpc-0c3fe55b1e0c3fea6
- **Log Group**: /ecs/seg-user-app

## Current Configuration

- **CPU**: 512 units (0.5 vCPU)
- **Memory**: 1024MB (1GB)
- **Platform**: Fargate
- **Networking**: Public subnet with internet gateway
- **Port**: 8000 (HTTP)
- **Secrets**: RSA key stored in AWS Secrets Manager (`seg-user-app/snowflake-rsa-key`)


- Fast
```bash
docker build -t seg-user-app .
docker tag seg-user-app:latest 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
aws ecr get-login-password --region us-east-1 --profile myaws | docker login --username AWS --password-stdin 983102014556.dkr.ecr.us-east-1.amazonaws.com
docker push 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
aws ecs list-tasks --cluster seg-user-app-cluster --region us-east-1 --profile myaws
```
Then stop the task (replace TASK_ID with actual ID):
```bash
aws ecs stop-task --cluster seg-user-app-cluster --task TASK_ID --region us-east-1 --profile myaws
```
```bash
aws ecs run-task --cluster seg-user-app-cluster --task-definition seg-user-app:4 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-0c8fc60cca8c6eda9],securityGroups=[sg-05c78762d0d99d139],assignPublicIp=ENABLED}" --region us-east-1 --profile myaws
```
Get the new task ID from step 6 output, then:
```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks NEW_TASK_ID --region us-east-1 --profile myaws
```
Extract the `networkInterfaceId` from the output, then:
```bash
aws ec2 describe-network-interfaces --network-interface-ids NETWORK_INTERFACE_ID --region us-east-1 --profile myaws