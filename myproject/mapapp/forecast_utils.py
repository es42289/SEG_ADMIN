import numpy as np
import pandas as pd
from typing import Any, Dict, Optional


def calc_decline(qi: float, di: float, b: float, periods: int) -> np.ndarray:
    """Calculate a simple Arps decline curve.

    Parameters
    ----------
    qi: float
        Initial production rate.
    di: float
        Initial decline rate.
    b: float
        Arps b-factor. Use ``0`` for exponential decline.
    periods: int
        Number of forecast periods.

    Returns
    -------
    numpy.ndarray
        Forecast production rates for each period.
    """
    t = np.arange(1, periods + 1)
    if b == 0:
        return qi * np.exp(-di * t)
    return qi / np.power(1 + b * di * t, 1 / b)


def combine_forecasts(
    multi_well_prd: pd.DataFrame, multi_econ_params: pd.DataFrame
) -> pd.DataFrame:
    """Generate decline forecasts for multiple wells.

    Parameters
    ----------
    multi_well_prd: pandas.DataFrame
        Historical production data. If provided, it will be concatenated with the
        forecast output. Expected columns include ``well_id`` and ``period`` or ``date``.
    multi_econ_params: pandas.DataFrame
        Decline parameters for each well. Expected columns include ``well_id``,
        ``qi``, ``di``, ``b`` (optional), and ``periods``.

    Returns
    -------
    pandas.DataFrame
        DataFrame containing historical production and decline forecasts for each well.
    """
    forecasts = []
    for _, params in multi_econ_params.iterrows():
        qi = params.get("qi")
        di = params.get("di")
        b = params.get("b", 0)
        periods = int(params.get("periods", 0))
        if periods <= 0:
            continue
        rates = calc_decline(qi, di, b, periods)
        df = pd.DataFrame(
            {
                "well_id": params["well_id"],
                "period": np.arange(1, periods + 1),
                "rate": rates,
            }
        )
        forecasts.append(df)

    forecast_df = pd.concat(forecasts, ignore_index=True) if forecasts else pd.DataFrame()
    if multi_well_prd is not None and not multi_well_prd.empty:
        forecast_df = pd.concat([multi_well_prd, forecast_df], ignore_index=True, sort=False)
    return forecast_df


def multi_well_fc_chart(
    chart_data: pd.DataFrame,
    params: Dict[str, Any],
    chart_data_2: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """Aggregate forecast data for charting.

    Parameters
    ----------
    chart_data: pandas.DataFrame
        Primary forecast data.
    params: Dict[str, Any]
        Chart configuration. Recognised keys:
            ``group`` - column to group by (default ``period``)
            ``value`` - column with numeric values (default ``rate``)
            ``agg`` - aggregation function (default ``sum``)
    chart_data_2: pandas.DataFrame, optional
        Secondary dataset for comparison. If provided, it will be merged on the
        group column with suffixes ``_1`` and ``_2``.

    Returns
    -------
    pandas.DataFrame
        Aggregated DataFrame suitable for charting.
    """
    group_col = params.get("group", "period")
    value_col = params.get("value", "rate")
    agg_func = params.get("agg", "sum")

    grouped = chart_data.groupby(group_col)[value_col].agg(agg_func).reset_index()

    if chart_data_2 is not None:
        grouped2 = chart_data_2.groupby(group_col)[value_col].agg(agg_func).reset_index()
        grouped = grouped.merge(grouped2, on=group_col, suffixes=("_1", "_2"))

    return grouped
