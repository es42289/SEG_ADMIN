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
            WHERE COMPLETIONDATE IS NOT NULL
            AND LATITUDE IS NOT NULL
            AND LONGITUDE IS NOT NULL
            -- AND api_uwi IN ('42-041-32667', '42-041-32540', '42-041-32602') 
            """
        )
        rows = cur.fetchall()

        out = []
        for lat, lon, lat_bh, lon_bh, cdate, cyear, api_uwi, last_prod in rows:
            label = f"Completion: {cdate}" if cdate is not None else "Well"  # ADD THIS LINE
            out.append({
                "lat": float(lat), 
                "lon": float(lon), 
                "lat_bh": float(lat_bh) if lat_bh else None,
                "lon_bh": float(lon_bh) if lon_bh else None,
                "label": label,  # Now this works
                "year": int(cyear),
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

def _snowflake_user_wells(owner_name):
    """Get rich data for user's specific wells from multiple tables"""
    conn = get_snowflake_connection()
    
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT
                w.LATITUDE AS LAT,
                w.LONGITUDE AS LON,
                w.LATITUDE_BH AS LAT_BH,
                w.LONGITUDE_BH AS LON_BH,
                w.COMPLETIONDATE,
                DATE_PART(year, w.COMPLETIONDATE) AS COMPLETION_YEAR,
                w.API_UWI,
                w.LASTPRODUCINGMONTH,
                a."Owner_Decimal_Interest",
                a."Owner"
            FROM WELLS.MINERALS.RAW_WELL_DATA w
            JOIN WELLS.MINERALS.DI_TX_MINERAL_APPRAISALS_2023_EXPLODED a 
                ON REPLACE(w.API_UWI, '-', '') = a.API_10
            WHERE w.COMPLETIONDATE IS NOT NULL
              AND w.LATITUDE IS NOT NULL
              AND w.LONGITUDE IS NOT NULL
              AND a."Owner" = %s
            ORDER BY w.COMPLETIONDATE
            """,
            (owner_name,),
        )
        rows = cur.fetchall()

        out = []
        for lat, lon, lat_bh, lon_bh, cdate, cyear, api_uwi, last_prod, interest, owner in rows:
            label = f"Well: {api_uwi}\nOwner: {owner}\nInterest: {interest}%\nCompletion: {cdate}"
            out.append({
                "lat": float(lat),
                "lon": float(lon),
                "lat_bh": float(lat_bh) if lat_bh else None,
                "lon_bh": float(lon_bh) if lon_bh else None,
                "label": label,
                "year": int(cyear) if cyear is not None else 2024,
                "api_uwi": api_uwi,
                "last_producing": last_prod,
                "owner_interest": float(interest) if interest else 0,
                "owner_name": owner
            })
        return out
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

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
            "api_uwi": [], "lat_bh": [], "lon_bh": [], 
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

    # Normalize & dedupe
    apis = [str(a).strip() for a in apis if str(a).strip()]
    # preserve order while deduping
    seen = set()
    apis = [a for a in apis if not (a in seen or seen.add(a))]

    if len(apis) > 5000:
        return JsonResponse({"error": "Too many APIs; max 5000 per request"}, status=400)

    conn = get_snowflake_connection()
    cur = conn.cursor()
    try:
        rows = []
        cols = None

        CHUNK = 1000  # Snowflake handles big IN lists, but chunk to be safe
        for i in range(0, len(apis), CHUNK):
            chunk = apis[i:i+CHUNK]
            placeholders = ",".join(["%s"] * len(chunk))
            sql = f"""
                SELECT *
                FROM WELLS.MINERALS.FORECASTS
                WHERE API_UWI IN ({placeholders})
            """
            cur.execute(sql, chunk)
            part = cur.fetchall()
            if cols is None:
                cols = [d[0] for d in cur.description]
            rows.extend(part)

        data_rows = [dict(zip(cols, r)) for r in rows] if cols else []

        # Group by API_UWI if present
        by_api = None
        if cols:
            api_col = next((c for c in cols if c.upper() == "API_UWI"), None)
            if api_col:
                grouped = {}
                for rec in data_rows:
                    key = rec.get(api_col)
                    grouped.setdefault(key, []).append(rec)
                by_api = grouped

        return JsonResponse({"count": len(data_rows), "rows": data_rows, "by_api": by_api})
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
    all_months = pd.date_range(combined.index.min(), pd.Timestamp("2075-01-01"), freq="MS")
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
    placeholders = ",".join(["%s"] * len(apis))
    sql = (
        "SELECT API_UWI, PRODUCINGMONTH, LIQUIDSPROD_BBL, GASPROD_MCF, "
        '"OilFcst_BBL", "GasFcst_MCF" FROM WELLS.MINERALS.FORECASTS '
        f"WHERE API_UWI IN ({placeholders})"
    )
    cur.execute(sql, apis)
    rows = cur.fetchall()
    cols = [c[0] for c in cur.description]
    conn.close()
    df = pd.DataFrame(rows, columns=cols)
    df["PRODUCINGMONTH"] = pd.to_datetime(df["PRODUCINGMONTH"])
    return df


def economics_data(request):
    if "user" not in request.session:
        return redirect("/login/")
    deck = request.GET.get("deck")
    user_email = request.session["user"].get("email", "")
    owner_name = get_user_owner_name(user_email)
    wells = _snowflake_user_wells(owner_name)
    apis = [w["api_uwi"] for w in wells]
    price_df = fetch_price_decks()
    deck_df = get_blended_price_deck(deck, price_df)
    fc = fetch_forecasts_for_apis(apis)
    fc["OilVol"] = fc["LIQUIDSPROD_BBL"].fillna(fc["OilFcst_BBL"])
    fc["GasVol"] = fc["GASPROD_MCF"].fillna(fc["GasFcst_MCF"])
    monthly = fc.groupby("PRODUCINGMONTH").agg({"OilVol": "sum", "GasVol": "sum"}).reset_index()
    merged = monthly.merge(
        deck_df[["MONTH_DATE", "OIL", "GAS"]],
        left_on="PRODUCINGMONTH",
        right_on="MONTH_DATE",
        how="left",
    )
    merged["OilRevenue"] = merged["OilVol"] * merged["OIL"]
    merged["GasRevenue"] = merged["GasVol"] * merged["GAS"]
    merged["NetCashFlow"] = merged["OilRevenue"] + merged["GasRevenue"]
    merged = merged.sort_values("PRODUCINGMONTH").reset_index(drop=True)
    merged["CumRevenue"] = (merged["OilRevenue"] + merged["GasRevenue"]).cumsum()
    merged["CumNCF"] = merged["NetCashFlow"].cumsum()
    merged["month_index"] = merged.index

    def npv(rate):
        return float((merged["NetCashFlow"] / (1 + rate) ** (merged["month_index"] / 12)).sum())

    npvs = [{"rate": r, "npv": npv(r)} for r in [0.0, 0.05, 0.1]]

    cum = {
        "dates": merged["PRODUCINGMONTH"].dt.strftime("%Y-%m-%d").tolist(),
        "cum_revenue": merged["CumRevenue"].tolist(),
        "cum_ncf": merged["CumNCF"].tolist(),
    }

    today = pd.Timestamp.today().normalize().replace(day=1)
    start = today - pd.DateOffset(months=12)
    end = today + pd.DateOffset(months=24)
    window_df = merged[(merged["PRODUCINGMONTH"] >= start) & (merged["PRODUCINGMONTH"] <= end)]
    window = {
        "dates": window_df["PRODUCINGMONTH"].dt.strftime("%Y-%m-%d").tolist(),
        "ncf": window_df["NetCashFlow"].tolist(),
        "today": today.strftime("%Y-%m-%d"),
    }

    def period_sum(start, end):
        mask = (merged["PRODUCINGMONTH"] >= start) & (merged["PRODUCINGMONTH"] <= end)
        sub = merged.loc[mask]
        if sub.empty:
            return 0
        return float(sub["CumNCF"].iloc[-1] - sub["CumNCF"].iloc[0])

    summary = []
    summary.append({"label": "LTM", "value": period_sum(start, today)})
    summary.append({"label": "NTM", "value": period_sum(today, today + pd.DateOffset(months=12))})
    year = today.year
    for yr in range(year, year + 6):
        s = pd.Timestamp(f"{yr}-01-01")
        e = pd.Timestamp(f"{yr}-12-31")
        summary.append({"label": str(yr), "value": period_sum(s, e)})

    return JsonResponse({"npv": npvs, "cum": cum, "window": window, "summary": summary})
