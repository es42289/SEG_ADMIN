# Django Plotly Map Starter (Snowflake-backed)

Routes:
- `/map/` — page with Plotly map and year slider
- `/map-data/?date=YYYY-01-01` — JSON endpoint fetching points from `WELLS.MINERALS.RAW_WELL_DATA`

### UI build tooling

- Tailwind/PostCSS build scaffold added for future UI refactor.
- Files touched and why:
  - `.gitignore` — ignore `node_modules/` artifacts from build-time installs.
  - `package.json` — defines Tailwind/PostCSS dev dependencies and `build:css` script outputting `static/mapapp/css/tailwind.css`.
  - `postcss.config.js` — enables Tailwind + Autoprefixer during CSS build.
  - `tailwind.config.js` — configures content paths for Django templates/JS and purge.
  - `myproject/mapapp/static/src/tailwind.css` — Tailwind entry point (base/components/utilities).
  - `myproject/mapapp/static/mapapp/css/tailwind.css` — built CSS (temporary inline subset checked in to keep responsive shell working when registry access is blocked).
- `myproject/mapapp/templates/base.html` — updated to a Tailwind-driven responsive shell (header, collapsible navigation, footer, responsive container) without touching page-specific content.

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
SNOWFLAKE_PRIVATE_KEY_SECRET_ID=seg-user-app/snowflake-rsa-key  # or set SNOWFLAKE_PRIVATE_KEY_PATH
SNOWFLAKE_PRIVATE_KEY_PATH=/path/to/rsa_key.pem                 # optional local override
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
The Django view automatically ensures the bucket's CORS rules allow requests
from the active site origin, so the IAM principal must also be able to call
`s3:GetBucketCORS` and `s3:PutBucketCORS`. If those permissions are missing the
upload dialog will surface a warning and the CORS configuration must be updated
manually. A minimal rule looks like this:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedOrigins": ["https://your-site.example"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 300
    }
  ]
}
```

### Step-by-step: Configure Snowflake key-pair authentication

If you have been issued an RSA key instead of a password for the Snowflake
service user, follow these steps to wire it into the Django upload endpoints.

1. **Locate your PEM private key.** The helper expects a PEM-encoded RSA key on
   disk (for example, a file that starts with `-----BEGIN PRIVATE KEY-----`). If
   the key is encrypted, keep the passphrase handy; if it is unencrypted you can
   leave the passphrase variable unset.
2. **Pick a secure file path.** Place the key somewhere only your user account
   can read (for instance `C:\\secrets\\snowflake_rsa_key.pem` on Windows or
   `~/secrets/snowflake_rsa_key.pem` on macOS/Linux). Ensure the directory
   exists and the file permissions restrict access to your account.
3. **Export the Snowflake connection variables.** You need the standard
   connection parameters plus either a Secrets Manager identifier or a key path
   before launching `manage.py`:
   ```powershell
   $env:SNOWFLAKE_ACCOUNT = "<ACCOUNT>"
   $env:SNOWFLAKE_USER = "ELII"
   $env:SNOWFLAKE_ROLE = "APP_ROLE_MIN"          # optional but recommended
   $env:SNOWFLAKE_WAREHOUSE = "COMPUTE_WH"
   $env:SNOWFLAKE_DATABASE = "WELLS"
   $env:SNOWFLAKE_SCHEMA = "MINERALS"
   $env:SNOWFLAKE_PRIVATE_KEY_SECRET_ID = "seg-user-app/snowflake-rsa-key"
   # To use a local file instead of Secrets Manager:
   # $env:SNOWFLAKE_PRIVATE_KEY_PATH = "C:\\secrets\\snowflake_rsa_key.pem"
   # Only set this if the key is encrypted:
   # $env:SNOWFLAKE_PRIVATE_KEY_PASSPHRASE = "<PASSPHRASE>"
   ```
   Password-based authentication is no longer supported; configure Secrets
   Manager or a private key path instead. The same variable names work in `.env`
   files (`KEY=value`) or other shells (`export KEY=value`).
4. **Restart the Django server.** Stop any running `python manage.py runserver`
   process and start a new one from the same shell so it inherits the variables.
   Watch the terminal for `SnowflakeConfigurationError` messages—if you see
   them, double-check the names and values above.
5. **Verify the upload APIs.** Load the dashboard and confirm the supporting
   documents table renders without a 500 error. If the API still fails, inspect
   the server logs for authentication errors and ensure your AWS credentials are
   also set (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional
   `AWS_SESSION_TOKEN`, and `AWS_DEFAULT_REGION=us-east-2`).

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

### 1. Build Docker Image (with clean rebuild)
```bash
docker build --no-cache -t seg-user-app .
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

### 5. Deploy to ECS (Zero Downtime)
```bash
aws ecs update-service --cluster seg-user-app-cluster --service seg-user-app-service --force-new-deployment --region us-east-1 --profile myaws
```

Wait 1-2 minutes for the new task to start and become healthy.

### 6. Get New Public IP Address
```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks $(aws ecs list-tasks --cluster seg-user-app-cluster --service-name seg-user-app-service --region us-east-1 --profile myaws --query 'taskArns[0]' --output text) --region us-east-1 --profile myaws --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value | [0]' --output text | %{aws ec2 describe-network-interfaces --network-interface-ids $_ --region us-east-1 --profile myaws --query 'NetworkInterfaces[0].Association.PublicIp' --output text}
```

### 7. Update External Configurations

When the public IP changes, update:

1. **Snowflake Network Policy**:
```sql
   ALTER NETWORK POLICY streamlit_policy
     SET ALLOWED_IP_LIST = ('existing_ips', 'NEW_PUBLIC_IP');
```

2. **Auth0 Callback URLs** (if applicable):
   Add `http://NEW_PUBLIC_IP:8000/callback/` to allowed callback URLs

## Application URL

The app is accessible at: **https://user-app.stablegp.com**

## Troubleshooting

### Check Service Status
```bash
aws ecs describe-services --cluster seg-user-app-cluster --services seg-user-app-service --region us-east-1 --profile myaws
```

### Check Task Status
```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks $(aws ecs list-tasks --cluster seg-user-app-cluster --service-name seg-user-app-service --region us-east-1 --profile myaws --query 'taskArns[0]' --output text) --region us-east-1 --profile myaws
```

### View Application Logs
```bash
aws logs tail "/ecs/seg-user-app" --follow --region us-east-1 --profile myaws
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


- Fast redeploy
```bash
docker build --no-cache -t seg-user-app .
docker tag seg-user-app:latest 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
aws ecr get-login-password --region us-east-1 --profile myaws | docker login --username AWS --password-stdin 983102014556.dkr.ecr.us-east-1.amazonaws.com
docker push 983102014556.dkr.ecr.us-east-1.amazonaws.com/seg-user-app:latest
aws ecs update-service --cluster seg-user-app-cluster --service seg-user-app-service --force-new-deployment --region us-east-1 --profile myaws
```

Wait 1-2 minutes for the new task to start and become healthy.

```bash
aws ecs describe-tasks --cluster seg-user-app-cluster --tasks $(aws ecs list-tasks --cluster seg-user-app-cluster --service-name seg-user-app-service --region us-east-1 --profile myaws --query 'taskArns[0]' --output text) --region us-east-1 --profile myaws --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value | [0]' --output text | %{aws ec2 describe-network-interfaces --network-interface-ids $_ --region us-east-1 --profile myaws --query 'NetworkInterfaces[0].Association.PublicIp' --output text}
```
```bash
```