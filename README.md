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

