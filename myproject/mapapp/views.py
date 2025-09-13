from django.http import JsonResponse
from django.shortcuts import render
from datetime import date, datetime
import os
import snowflake.connector
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from django.shortcuts import render, redirect
import json
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
import pandas as pd
import numpy as np
from functools import lru_cache

def get_snowflake_connection():
    key_path = os.getenv("SNOWFLAKE_KEY_PATH") or os.getenv("SF_PRIVATE_KEY_PATH")
    if not key_path:
        raise RuntimeError("Set SNOWFLAKE_KEY_PATH to your rsa_key.pem")

    with open(key_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=(os.getenv("SNOWFLAKE_KEY_PASSPHRASE") or os.getenv("SF_PRIVATE_KEY_PASSPHRASE") or None)
                     and (os.getenv("SNOWFLAKE_KEY_PASSPHRASE") or os.getenv("SF_PRIVATE_KEY_PASSPHRASE")).encode(),
            backend=default_backend(),
        )

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    cfg = {
        "account": os.getenv("SF_ACCOUNT") or "CMZNSCB-MU47932",
        "user": os.getenv("SF_USER") or "ELII",
        "warehouse": os.getenv("SF_WAREHOUSE") or "COMPUTE_WH",
        "database": os.getenv("SF_DATABASE") or "WELLS",
        "schema": os.getenv("SF_SCHEMA") or "MINERALS",
        "private_key": private_key_bytes,
    }
    return snowflake.connector.connect(**cfg)

def _snowflake_points():
    key_path = os.getenv("SNOWFLAKE_KEY_PATH")
    if not key_path or not os.path.exists(key_path):
        raise RuntimeError(f"SNOWFLAKE_KEY_PATH not set or file not found: {key_path}")

    with open(key_path, "rb") as key_file:
        private_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None,  # set a bytes passphrase here if your key is encrypted
            backend=default_backend(),
        )

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    conn = snowflake.connector.connect(
        account=os.getenv("SF_ACCOUNT", "CMZNSCB-MU47932"),
        user=os.getenv("SF_USER", "ELII"),
        warehouse=os.getenv("SF_WAREHOUSE", "COMPUTE_WH"),
        database=os.getenv("SF_DATABASE", "WELLS"),
        schema=os.getenv("SF_SCHEMA", "MINERALS"),
        private_key=private_key_bytes,
    )

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                LATITUDE   AS LAT,
                LONGITUDE  AS LON,
                LATITUDE_BH AS LAT_BH,     -- Add this
                LONGITUDE_BH AS LON_BH,    -- Add this
                COMPLETIONDATE,
                DATE_PART(year, COMPLETIONDATE) AS COMPLETION_YEAR,
                API_UWI,
                LASTPRODUCINGMONTH
            FROM WELLS.MINERALS.RAW_WELL_DATA
            WHERE LATITUDE IS NOT NULL
              AND LONGITUDE IS NOT NULL
            -- AND api_uwi IN ('42-041-32667', '42-041-32540', '42-041-32602')
            """
        )
        rows = cur.fetchall()

        out = []
        for lat, lon, lat_bh, lon_bh, cdate, cyear, api_uwi, last_prod in rows:
            label = f"Completion: {cdate}" if cdate is not None else "Well"
            if cyear is not None:
                year_val = int(cyear)
            elif last_prod:
                try:
                    year_val = pd.to_datetime(last_prod).year
                except Exception:
                    year_val = None
            else:
                year_val = None

            out.append({
                "lat": float(lat),
                "lon": float(lon),
                "lat_bh": float(lat_bh) if lat_bh else None,
                "lon_bh": float(lon_bh) if lon_bh else None,
                "label": label,
                "year": year_val,
                "api_uwi": api_uwi,
                "last_producing": last_prod
            })
        return out
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

def map_page(request):
    """Renders the HTML page with Plotly map + slider."""
    # Check if user is logged in
    if 'user' not in request.session:
        return redirect('/login/')
    
    return render(request, "map.html", {})

def map_data(request):
    """Returns JSON for map points."""
    # Check if user is logged in
    if 'user' not in request.session:
        return redirect('/login/')
    
    # Your existing map_data code here...
    rows = _snowflake_points()
    return JsonResponse({
        "lat": [r["lat"] for r in rows],
        "lon": [r["lon"] for r in rows],
        "text": [r["label"] for r in rows],
        "year": [r["year"] for r in rows],
        "api_uwi": [r["api_uwi"] for r in rows],
        "lat_bh": [r["lat_bh"] for r in rows],
        "lon_bh": [r["lon_bh"] for r in rows],
        "last_producing": [r["last_producing"] for r in rows],
    })

def get_user_owner_name(user_email):
    """Query Snowflake to get the owner name for a user's email"""
    conn = get_snowflake_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT OWNER_NAME FROM WELLS.MINERALS.USER_MAPPINGS WHERE AUTH0_EMAIL = %s", (user_email,))
        result = cur.fetchone()
        return result[0] if result else None
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


@lru_cache(maxsize=1)
def get_all_wells_with_owners():
    """Fetch all wells with owner information and cache the result."""
    conn = get_snowflake_connection()
    try:
        cur = conn.cursor()
        # Select all columns so the query succeeds even if some optional
        # fields (e.g. OWNER_INTEREST_LIST) are missing in the table.
        cur.execute(
            """
            SELECT *
            FROM WELLS.MINERALS.RAW_WELL_DATA_WITH_OWNERS
            WHERE LATITUDE IS NOT NULL
              AND LONGITUDE IS NOT NULL
            """
        )
        rows = cur.fetchall()
        cols = [c[0] for c in cur.description]
        df = pd.DataFrame(rows, columns=cols)
        # Derive completion year if not provided
        if "COMPLETION_YEAR" not in df.columns and "COMPLETIONDATE" in df.columns:
            df["COMPLETION_YEAR"] = pd.to_datetime(df["COMPLETIONDATE"]).dt.year
        # Helper column for API without dashes
        if "API_UWI" in df.columns:
            df["API_NODASH"] = df["API_UWI"].str.replace('-', '', regex=False)
        return df
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def _snowflake_user_wells(owner_name):
    """Get rich data for user's specific wells from cached data."""
    all_wells = get_all_wells_with_owners()

    # Filter wells where the owner appears in the pipe-delimited OWNER_LIST
    mask = all_wells["OWNER_LIST"].fillna("").apply(
        lambda owners_csv: any(
            owner_name.lower() == o.strip().lower() for o in owners_csv.split("|") if o
        )
    )
    df = all_wells.loc[mask].copy()
    # Snowflake can return duplicate rows for a well. Drop them so each well
    # is only counted once in downstream tables and calculations.
    if "API_UWI" in df.columns:
        df = df.drop_duplicates(subset=["API_UWI"])

    def interest_for_row(row):
        owners = [o.strip() for o in str(row.get("OWNER_LIST", "")).split("|")]
        interests_raw = str(row.get("NRI_LIST", row.get("OWNER_INTEREST_LIST", "")))
        interests = [i.strip() for i in interests_raw.split("|")]
        total = 0.0
        for o, i in zip(owners, interests):
            if o.lower() == owner_name.lower():
                try:
                    total += float(i)
                except Exception:
                    continue
        return total

    out = []
    for _, row in df.iterrows():
        interest = interest_for_row(row)
        cdate = row["COMPLETIONDATE"]
        label = (
            f"Well: {row['API_UWI']}\n"
            f"Owner: {owner_name}\n"
            f"Interest: {interest}%\n"
            f"Completion: {cdate}"
        )

        traj_raw = str(row.get("TRAJECTORY", ""))
        trajectory = "Horizontal" if traj_raw.strip().upper().startswith("H") else "Vertical"

        first_dates = [row.get("FIRSTPRODMONTHOIL"), row.get("FIRSTPRODMONTHGAS")]
        first_dates = [pd.to_datetime(d) for d in first_dates if pd.notnull(d)]
        first_prod = min(first_dates).date().isoformat() if first_dates else None

        last_dates = [
            row.get("LASTPRODUCINGMONTHOIL"),
            row.get("LASTPRODUCINGMONTHGAS"),
            row.get("LASTPRODUCINGMONTH"),
        ]
        last_dates = [pd.to_datetime(d) for d in last_dates if pd.notnull(d)]
        last_prod = max(last_dates).date().isoformat() if last_dates else None

        out.append({
            "lat": float(row["LATITUDE"]),
            "lon": float(row["LONGITUDE"]),
            "lat_bh": float(row["LATITUDE_BH"]) if pd.notnull(row["LATITUDE_BH"]) else None,
            "lon_bh": float(row["LONGITUDE_BH"]) if pd.notnull(row["LONGITUDE_BH"]) else None,
            "label": label,
            "year": (
                int(row["COMPLETION_YEAR"]) if pd.notnull(row["COMPLETION_YEAR"])
                else (
                    pd.to_datetime(row["LASTPRODUCINGMONTH"]).year
                    if pd.notnull(row["LASTPRODUCINGMONTH"]) else None
                )
            ),
            "api_uwi": row["API_UWI"],
            "name": row.get("WELL_NAME") or row.get("WELLNAME"),
            "operator": row.get("ENVOPERATOR"),
            "trajectory": trajectory,
            "permit_date": row.get("PERMITAPPROVEDDATE"),
            "first_prod_date": first_prod,
            "last_prod_date": last_prod,
            "gross_oil_eur": row.get("GROSS_OIL_EUR"),
            "gross_gas_eur": row.get("GROSS_GAS_EUR"),
            "net_oil_eur": row.get("NET_OIL_EUR"),
            "net_gas_eur": row.get("NET_GAS_EUR"),
            "net_ngl_eur": row.get("NET_NGL_EUR"),
            "remaining_net_oil": row.get("REMAINING_NET_OIL"),
            "remaining_net_gas": row.get("REMAINING_NET_GAS"),
            "remaining_net_ngl": row.get("REMAINING_NET_NGL"),
            "pv0": row.get("PV0"),
            "pv10": row.get("PV10"),
            "pv12": row.get("PV12"),
            "pv14": row.get("PV14"),
            "pv16": row.get("PV16"),
            "pv18": row.get("PV18"),
            "pv20": row.get("PV20"),
            "last_producing": last_prod,
            "owner_interest": interest,
            "owner_name": owner_name,
        })

    return out

def user_wells_data(request):
    """Returns JSON for user's specific wells with rich data."""
    if 'user' not in request.session:
        return redirect('/login/')
    
    # Get user's email and find their owner name
    user_email = request.session['user'].get('email', '')
    owner_name = get_user_owner_name(user_email)
    
    if not owner_name:
        # User has no wells assigned
        return JsonResponse({
            "lat": [], "lon": [], "text": [], "year": [],
            "api_uwi": [], "name": [], "operator": [], "trajectory": [],
            "permit_date": [], "first_prod_date": [], "last_prod_date": [],
            "gross_oil_eur": [], "gross_gas_eur": [], "net_oil_eur": [],
            "net_gas_eur": [], "net_ngl_eur": [], "remaining_net_oil": [],
            "remaining_net_gas": [], "remaining_net_ngl": [],
            "pv0": [], "pv10": [], "pv12": [], "pv14": [], "pv16": [],
            "pv18": [], "pv20": [],
            "lat_bh": [], "lon_bh": [],
            "last_producing": [], "owner_interest": [], "owner_name": []
        })
    
    # Get user's wells with rich data
    rows = _snowflake_user_wells(owner_name)
    return JsonResponse({
        "lat": [r["lat"] for r in rows],
        "lon": [r["lon"] for r in rows],
        "text": [r["label"] for r in rows],
        "year": [r["year"] for r in rows],
        "api_uwi": [r["api_uwi"] for r in rows],
        "name": [r["name"] for r in rows],
        "operator": [r["operator"] for r in rows],
        "trajectory": [r["trajectory"] for r in rows],
        "permit_date": [r["permit_date"] for r in rows],
        "first_prod_date": [r["first_prod_date"] for r in rows],
        "last_prod_date": [r["last_prod_date"] for r in rows],
        "gross_oil_eur": [r["gross_oil_eur"] for r in rows],
        "gross_gas_eur": [r["gross_gas_eur"] for r in rows],
        "net_oil_eur": [r["net_oil_eur"] for r in rows],
        "net_gas_eur": [r["net_gas_eur"] for r in rows],
        "net_ngl_eur": [r["net_ngl_eur"] for r in rows],
        "remaining_net_oil": [r["remaining_net_oil"] for r in rows],
        "remaining_net_gas": [r["remaining_net_gas"] for r in rows],
        "remaining_net_ngl": [r["remaining_net_ngl"] for r in rows],
        "pv0": [r["pv0"] for r in rows],
        "pv10": [r["pv10"] for r in rows],
        "pv12": [r["pv12"] for r in rows],
        "pv14": [r["pv14"] for r in rows],
        "pv16": [r["pv16"] for r in rows],
        "pv18": [r["pv18"] for r in rows],
        "pv20": [r["pv20"] for r in rows],
        "lat_bh": [r["lat_bh"] for r in rows],
        "lon_bh": [r["lon_bh"] for r in rows],
        "last_producing": [r["last_producing"] for r in rows],
        "owner_interest": [r["owner_interest"] for r in rows],
        "owner_name": [r["owner_name"] for r in rows],
    })

@csrf_exempt
@require_http_methods(["POST"])
def bulk_well_production(request):
    """
    POST JSON: {"apis": ["42-161-32531", "42-xxx-xxxxx", ...]}
    Returns:
      {
        "count": <total rows>,
        "rows": [ {<FORECASTS columns>...}, ... ],
        "by_api": { "42-161-32531": [ {...}, {...} ], ... }  # if API_UWI column present
      }
    """
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    apis = payload.get("apis")
    if not isinstance(apis, list) or not apis:
        return JsonResponse({"error": "Provide 'apis' as a non-empty list"}, status=400)

    # Normalize, strip dashes for DB lookup, and dedupe while preserving order
    apis = [str(a).strip() for a in apis if str(a).strip()]
    seen = set()
    apis = [a for a in apis if not (a in seen or seen.add(a))]
    apis_clean = [a.replace("-", "") for a in apis]

    if len(apis) > 5000:
        return JsonResponse({"error": "Too many APIs; max 5000 per request"}, status=400)

    conn = get_snowflake_connection()
    cur = conn.cursor()
    try:
        rows = []
        cols = None

        CHUNK = 1000  # Snowflake handles big IN lists, but chunk to be safe
        for i in range(0, len(apis_clean), CHUNK):
            chunk = apis_clean[i:i+CHUNK]
            placeholders = ",".join(["%s"] * len(chunk))
            sql = f"""
                SELECT *
                FROM WELLS.MINERALS.FORECASTS
                WHERE REPLACE(API_UWI, '-', '') IN ({placeholders})
            """
            cur.execute(sql, chunk)
            part = cur.fetchall()
            if cols is None:
                cols = [d[0] for d in cur.description]
            rows.extend(part)

        data_rows = [dict(zip(cols, r)) for r in rows] if cols else []

        # Group by normalized API to align with input values
        by_api = None
        missing = None
        if cols:
            api_col = next((c for c in cols if c.upper() == "API_UWI"), None)
            if api_col:
                grouped = {}
                for rec in data_rows:
                    key = str(rec.get(api_col, "")).replace("-", "")
                    grouped.setdefault(key, []).append(rec)
                # Map sanitized keys back to original format when possible
                key_map = {a.replace("-", ""): a for a in apis}
                by_api = {key_map.get(k, k): v for k, v in grouped.items()}
                # Determine which requested APIs returned no rows
                missing_norm = set(key_map.keys()) - set(grouped.keys())
                if missing_norm:
                    missing = {
                        key_map.get(k, k): "No production data found" for k in missing_norm
                    }

        return JsonResponse({
            "count": len(data_rows),
            "rows": data_rows,
            "by_api": by_api,
            "missing": missing,
        })
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


def fetch_price_decks():
    conn = get_snowflake_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT PRICE_DECK_NAME, MONTH_DATE, OIL, GAS FROM PRICE_DECK"
    )
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    conn.close()
    return pd.DataFrame(rows, columns=cols)


def get_blended_price_deck(active_name, price_decks):
    hist = price_decks[price_decks["PRICE_DECK_NAME"] == "HIST"].copy()
    df = price_decks[price_decks["PRICE_DECK_NAME"] == active_name].copy()
    combined = pd.concat([df, hist], ignore_index=True)
    combined["MONTH_DATE"] = pd.to_datetime(combined["MONTH_DATE"])
    combined = combined.drop_duplicates("MONTH_DATE").sort_values("MONTH_DATE")
    combined = combined.set_index("MONTH_DATE")
    # Price deck data is stored with end-of-month dates. Reindex using month-end
    # frequency so existing rows line up instead of being dropped by month-start
    # misalignment which left the chart with no data.
    all_months = pd.date_range(
        combined.index.min(), pd.Timestamp("2075-01-01"), freq="ME"
    )
    combined = combined.reindex(all_months)
    combined[["OIL", "GAS"]] = combined[["OIL", "GAS"]].apply(pd.to_numeric, errors="coerce")
    combined[["OIL", "GAS"]] = combined[["OIL", "GAS"]].interpolate()
    combined = combined.reset_index().rename(columns={"index": "MONTH_DATE"})
    combined["PRICE_DECK_NAME"] = combined["PRICE_DECK_NAME"].fillna("Interpolated")
    combined = combined[combined["MONTH_DATE"] <= pd.Timestamp("2038-01-01")]
    combined = combined.dropna(subset=["OIL", "GAS"])
    return combined


def price_decks(request):
    if "user" not in request.session:
        return redirect("/login/")
    deck = request.GET.get("deck")
    df = fetch_price_decks()
    options = sorted(df["PRICE_DECK_NAME"].unique())
    if deck:
        blended = get_blended_price_deck(deck, df)
        data = json.loads(blended.to_json(orient="records", date_format="iso"))
        return JsonResponse({"options": options, "data": data})
    return JsonResponse({"options": options})


def fetch_forecasts_for_apis(apis):
    conn = get_snowflake_connection()
    cur = conn.cursor()
    apis_clean = [a.replace("-", "") for a in apis]
    placeholders = ",".join(["%s"] * len(apis_clean))
    sql = (
        "SELECT *, REPLACE(API_UWI, '-', '') AS API_NODASH "
        "FROM WELLS.MINERALS.FORECASTS "
        f"WHERE REPLACE(API_UWI, '-', '') IN ({placeholders})"
    )
    cur.execute(sql, apis_clean)
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    conn.close()

    df = pd.DataFrame(rows, columns=cols)
    # Ensure we have a proper datetime column for monthly aggregation
    df["PRODUCINGMONTH"] = pd.to_datetime(df["PRODUCINGMONTH"], errors="coerce")
    df = df.dropna(subset=["PRODUCINGMONTH"])

    # Normalize forecast column names regardless of case in the source table
    rename_map = {}
    for col in df.columns:
        upper = col.upper()
        if upper == "OILFCST_BBL":
            rename_map[col] = "OilFcst_BBL"
        elif upper == "GASFCST_MCF":
            rename_map[col] = "GasFcst_MCF"
    if rename_map:
        df = df.rename(columns=rename_map)

    for col in ["OilFcst_BBL", "GasFcst_MCF"]:
        if col not in df.columns:
            df[col] = pd.NA

    if "API_NODASH" not in df.columns and "API_UWI" in df.columns:
        df["API_NODASH"] = df["API_UWI"].str.replace('-', '', regex=False)

    return df


def economics_data(request):
    if "user" not in request.session:
        return redirect("/login/")
    deck = request.GET.get("deck")
    user_email = request.session["user"].get("email", "")
    owner_name = get_user_owner_name(user_email)
    wells = _snowflake_user_wells(owner_name)
    # Ensure each well is only processed once
    wells_by_api = {w["api_uwi"]: w for w in wells}
    apis = list(wells_by_api.keys())
    price_df = fetch_price_decks()
    deck_df = get_blended_price_deck(deck, price_df)
    fc = fetch_forecasts_for_apis(apis)
    # Start with 100% working-interest volumes. Depending on the setting below,
    # the owner's net-interest may be applied before or after economic
    # deductions are taken so that our results can mirror other applications.
    fc["OilVolWI"] = (
        fc["LIQUIDSPROD_BBL"].fillna(fc["OilFcst_BBL"]).fillna(0)
    )
    fc["GasVolWI"] = (
        fc["GASPROD_MCF"].fillna(fc["GasFcst_MCF"]).fillna(0)
    )
    interest_map = {
        api.replace('-', ''): data["owner_interest"] for api, data in wells_by_api.items()
    }
    fc["OwnerInterest"] = fc["API_NODASH"].map(interest_map).fillna(0)
    # Economic parameters – in a fuller application these would come from a
    # scenario table. Using defaults allows the economics to run even when
    # such configuration is absent.
    oil_basis_pct = 1.0
    oil_basis_amt = 0.0
    gas_basis_pct = 1.0
    gas_basis_amt = 0.0
    ngl_basis_pct = 0.3
    ngl_basis_amt = 0.0
    ngl_yield = 10.0  # BBL/MMCF
    gas_shrink = 0.9
    oil_gpt = gas_gpt = ngl_gpt = 0.0
    oil_opt = gas_opt = ngl_opt = 0.0
    oil_tax = 0.046
    gas_tax = 0.075
    ngl_tax = 0.046
    ad_val_tax = 0.02
    apply_nri_before_tax = True
    # Forecast data often uses the first day of the month while price decks
    # are keyed by the last day. Shifting to month-end ensures the merge below
    # finds matching rows instead of leaving the economic charts empty.
    fc["PRODUCINGMONTH"] = fc["PRODUCINGMONTH"] + pd.offsets.MonthEnd(0)
    fc = fc.merge(
        deck_df[["MONTH_DATE", "OIL", "GAS"]],
        left_on="PRODUCINGMONTH",
        right_on="MONTH_DATE",
        how="left",
    )
    fc[["OilVolWI", "GasVolWI", "OIL", "GAS", "OwnerInterest"]] = fc[
        ["OilVolWI", "GasVolWI", "OIL", "GAS", "OwnerInterest"]
    ].fillna(0)

    # Apply NRI to volumes if deductions/taxes should be calculated on the
    # owner's share. Otherwise volumes remain at 100% working interest and the
    # money columns are scaled later.
    if apply_nri_before_tax:
        fc["OilVol"] = fc["OilVolWI"] * fc["OwnerInterest"]
        fc["GasVol"] = fc["GasVolWI"] * fc["OwnerInterest"]
    else:
        fc["OilVol"] = fc["OilVolWI"]
        fc["GasVol"] = fc["GasVolWI"]

    net_gas = fc["GasVol"] * gas_shrink
    fc["NGLVol"] = (net_gas / 1000.0) * ngl_yield

    fc["RealOil"] = fc["OIL"] * oil_basis_pct + oil_basis_amt
    fc["RealGas"] = fc["GAS"] * gas_basis_pct + gas_basis_amt
    fc["RealNGL"] = fc["GAS"] * ngl_basis_pct + ngl_basis_amt

    fc["OilRevenue"] = fc["OilVol"] * fc["RealOil"]
    fc["GasRevenue"] = net_gas * fc["RealGas"]
    fc["NGLRevenue"] = fc["NGLVol"] * fc["RealNGL"]
    fc["GrossRevenue"] = fc["OilRevenue"] + fc["GasRevenue"] + fc["NGLRevenue"]

    fc["OilGPT"] = fc["OilVol"] * oil_gpt
    fc["GasGPT"] = fc["GasVol"] * gas_gpt
    fc["NGLGPT"] = fc["NGLVol"] * ngl_gpt
    fc["GPT"] = fc["OilGPT"] + fc["GasGPT"] + fc["NGLGPT"]

    fc["OilOPT"] = fc["OilVol"] * oil_opt
    fc["GasOPT"] = fc["GasVol"] * gas_opt
    fc["NGLOPT"] = fc["NGLVol"] * ngl_opt
    fc["OPT"] = fc["OilOPT"] + fc["GasOPT"] + fc["NGLOPT"]

    fc["OilSev"] = fc["OilRevenue"] * oil_tax
    fc["GasSev"] = fc["GasRevenue"] * gas_tax
    fc["NGLSev"] = fc["NGLRevenue"] * ngl_tax
    fc["SevTax"] = fc["OilSev"] + fc["GasSev"] + fc["NGLSev"]
    fc["AdValTax"] = fc["GrossRevenue"] * ad_val_tax

    fc["NetCashFlow"] = fc["GrossRevenue"] - fc["GPT"] - fc["OPT"] - fc["SevTax"] - fc["AdValTax"]

    if not apply_nri_before_tax:
        money_cols = [
            "OilRevenue",
            "GasRevenue",
            "NGLRevenue",
            "GrossRevenue",
            "OilGPT",
            "GasGPT",
            "NGLGPT",
            "GPT",
            "OilOPT",
            "GasOPT",
            "NGLOPT",
            "OPT",
            "OilSev",
            "GasSev",
            "NGLSev",
            "SevTax",
            "AdValTax",
            "NetCashFlow",
        ]
        fc[money_cols] = fc[money_cols].mul(fc["OwnerInterest"], axis=0)

    merged = (
        fc.groupby("PRODUCINGMONTH").agg(
            {
                "OilRevenue": "sum",
                "GasRevenue": "sum",
                "NGLRevenue": "sum",
                "GrossRevenue": "sum",
                "GPT": "sum",
                "OPT": "sum",
                "SevTax": "sum",
                "AdValTax": "sum",
                "NetCashFlow": "sum",
                "OilVol": "sum",
                "GasVol": "sum",
            }
        ).reset_index()
    )
    merged = merged.sort_values("PRODUCINGMONTH").reset_index(drop=True)
    money_cols = [
        "OilRevenue",
        "GasRevenue",
        "NGLRevenue",
        "GrossRevenue",
        "GPT",
        "OPT",
        "SevTax",
        "AdValTax",
        "NetCashFlow",
    ]
    merged[money_cols] = merged[money_cols].fillna(0)
    merged["OilVol"] = merged["OilVol"].fillna(0)
    merged["GasVol"] = merged["GasVol"].fillna(0)
    merged["CumRevenue"] = merged["GrossRevenue"].cumsum().fillna(0)
    merged["CumNCF"] = merged["NetCashFlow"].cumsum().fillna(0)
    merged["month_index"] = merged.index

    def npv_and_payback(rate):
        disc = merged["NetCashFlow"] / (1 + rate) ** (merged["month_index"] / 12)
        npv = float(disc.sum())
        cum_disc = disc.cumsum()
        payback_date = None
        if (cum_disc >= 0).any():
            payback_idx = cum_disc.ge(0).idxmax()
            payback_date = merged.loc[payback_idx, "PRODUCINGMONTH"]
        return {
            "rate": rate,
            "npv": npv,
            "payback": payback_date.strftime("%Y-%m-%d") if payback_date is not None else None,
        }

    npvs = [npv_and_payback(r) for r in [0.0, 0.05, 0.1]]

    cum = {
        "dates": merged["PRODUCINGMONTH"].dt.strftime("%Y-%m-%d").tolist(),
        "cum_revenue": merged["CumRevenue"].fillna(0).tolist(),
        "cum_ncf": merged["CumNCF"].fillna(0).tolist(),
    }

    last_month = merged["PRODUCINGMONTH"].max()
    current_month = pd.Timestamp.today().normalize() + pd.offsets.MonthEnd(0)
    if pd.isna(last_month):
        today = current_month
    else:
        # Ensure we don't treat far-future forecast dates as "today"
        today = min(last_month, current_month)

    # Window covering 12 months backward and 24 months forward
    window_start = today - pd.DateOffset(months=12)
    window_end = today + pd.DateOffset(months=24)
    window_df = merged[
        (merged["PRODUCINGMONTH"] >= window_start)
        & (merged["PRODUCINGMONTH"] <= window_end)
    ]
    window = {
        "dates": window_df["PRODUCINGMONTH"].dt.strftime("%Y-%m-%d").tolist(),
        "ncf": window_df["NetCashFlow"].fillna(0).tolist(),
        "today": today.strftime("%Y-%m-%d"),
    }

    # Starting point for LTM summaries
    ltm_start = today - pd.DateOffset(months=12)

    def period_sum(col, start, end):
        mask = (merged["PRODUCINGMONTH"] >= start) & (merged["PRODUCINGMONTH"] <= end)
        sub = merged.loc[mask]
        if sub.empty:
            return 0
        return float(sub[col].sum())

    ntm_end = today + pd.DateOffset(months=12)
    ltm_oil = period_sum("OilVol", ltm_start, today)
    ltm_gas = period_sum("GasVol", ltm_start, today)
    ltm_cf = period_sum("NetCashFlow", ltm_start, today)
    ntm_oil = period_sum("OilVol", today, ntm_end)
    ntm_gas = period_sum("GasVol", today, ntm_end)
    ntm_cf = period_sum("NetCashFlow", today, ntm_end)

    next_month = today + pd.DateOffset(months=1)
    future = merged[merged["PRODUCINGMONTH"] >= next_month].copy()
    if not future.empty:
        future["months_from_start"] = (
            future["PRODUCINGMONTH"].dt.to_period("M") - next_month.to_period("M")
        ).apply(lambda r: r.n)
    def pv(rate):
        if future.empty:
            return 0.0
        disc = future["NetCashFlow"] / (1 + rate) ** (future["months_from_start"] / 12)
        return float(disc.sum())
    pvs = {f"pv{int(r*100)}": pv(r) for r in [0.0, 0.10, 0.12, 0.14, 0.16, 0.18]}

    summary = []
    summary.append({"label": "LTM", "value": ltm_cf})
    summary.append({"label": "NTM", "value": ntm_cf})
    year = today.year
    for yr in range(year, year + 6):
        s = pd.Timestamp(f"{yr}-01-01")
        e = pd.Timestamp(f"{yr}-12-31")
        summary.append({"label": str(yr), "value": period_sum("NetCashFlow", s, e)})

    stats = {
        "ltm_oil": ltm_oil,
        "ltm_gas": ltm_gas,
        "ltm_cf": ltm_cf,
        "ntm_oil": ntm_oil,
        "ntm_gas": ntm_gas,
        "ntm_cf": ntm_cf,
        **pvs,
    }

    return JsonResponse({"npv": npvs, "cum": cum, "window": window, "summary": summary, "stats": stats})
