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
