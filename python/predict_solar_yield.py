#!/usr/bin/env python3
"""
Casa DaVinci — Solar Yield Prediction
======================================

Predicts daily solar energy production using historical data
from InfluxDB and simple ML regression models.

Uses:
- Historical daily yield from Victron MPPT charge controllers
- Time-of-year features (day length, solar elevation proxy)
- Rolling averages for weather pattern estimation

Satellite parallel: Energy budget prediction is critical for
spacecraft operations — predicting solar panel output based on
orbit parameters, sun angle, and eclipse periods to plan
payload operations within available power.

Author: Petr Kukla
"""

import os
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient
from sklearn.linear_model import Ridge
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import mean_absolute_error, r2_score

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', '')
INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'casa-davinci')
INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'energy-data')

# Casa DaVinci location (Loděnice u Berouna)
LATITUDE = 49.99
LONGITUDE = 14.15


def get_influx_client() -> InfluxDBClient:
    return InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)


def query_daily_yields(client: InfluxDBClient, days: int = 90) -> pd.DataFrame:
    """
    Query daily solar yield from both MPPT charge controllers.
    
    Victron MPPT controllers report cumulative daily yield in kWh
    via MQTT topics: solarcharger/278/History/Daily/0/Yield
    """
    query_api = client.query_api()
    
    flux_query = f'''
    from(bucket: "{INFLUXDB_BUCKET}")
        |> range(start: -{days}d)
        |> filter(fn: (r) => r["_measurement"] == "victron")
        |> filter(fn: (r) => 
            r["topic"] =~ /solarcharger\\/27[89]\\/Yield\\/Power/
        )
        |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
        |> pivot(rowKey: ["_time"], columnKey: ["topic"], valueColumn: "_value")
    '''
    
    try:
        df = query_api.query_data_frame(flux_query)
        if isinstance(df, list):
            df = pd.concat(df, ignore_index=True)
        return df
    except Exception as e:
        print(f"[ERROR] Query failed: {e}")
        return pd.DataFrame()


def compute_solar_features(dates: pd.Series) -> pd.DataFrame:
    """
    Compute solar-related features for each date.
    
    Simplified model using day-of-year as proxy for:
    - Day length (hours of sunlight)
    - Solar elevation angle
    - Expected irradiance
    
    For spacecraft: equivalent to computing beta angle
    and eclipse fraction from orbital elements.
    """
    doy = dates.dt.dayofyear
    
    # Approximate day length using sinusoidal model for latitude ~50°N
    # Max ~16h at summer solstice, min ~8h at winter solstice
    day_length = 12 + 4 * np.sin(2 * np.pi * (doy - 80) / 365)
    
    # Solar elevation proxy (peak elevation through year)
    solar_elevation = 23.5 + 43.5 * np.sin(2 * np.pi * (doy - 80) / 365)
    
    # Month as cyclic features
    month = dates.dt.month
    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)
    
    return pd.DataFrame({
        'day_of_year': doy,
        'day_length': day_length,
        'solar_elevation': solar_elevation,
        'month_sin': month_sin,
        'month_cos': month_cos,
        'weekday': dates.dt.weekday  # Not solar-relevant but captures patterns
    })


def train_prediction_model(df: pd.DataFrame) -> tuple:
    """
    Train a Ridge regression model with polynomial features.
    
    Ridge regression with polynomial features captures the
    seasonal curve of solar production without overfitting.
    """
    if df.empty or 'total_power' not in df.columns:
        return None, None, None
    
    dates = pd.to_datetime(df['_time'])
    features = compute_solar_features(dates)
    target = df['total_power'].values
    
    # Remove NaN
    mask = ~np.isnan(target)
    features = features[mask]
    target = target[mask]
    
    if len(target) < 14:  # Need at least 2 weeks
        print("[WARN] Insufficient data for reliable prediction")
        return None, None, None
    
    # Polynomial features (degree 2 captures seasonal curve)
    poly = PolynomialFeatures(degree=2, include_bias=False)
    X = poly.fit_transform(features)
    
    # Ridge regression (regularized to prevent overfitting)
    model = Ridge(alpha=1.0)
    model.fit(X, target)
    
    # Evaluate
    predictions = model.predict(X)
    mae = mean_absolute_error(target, predictions)
    r2 = r2_score(target, predictions)
    
    print(f"  Model R² score: {r2:.3f}")
    print(f"  Mean Absolute Error: {mae:.1f} W")
    
    return model, poly, {'mae': mae, 'r2': r2}


def predict_next_days(model, poly, days: int = 7) -> pd.DataFrame:
    """Generate predictions for the next N days."""
    future_dates = pd.date_range(start=datetime.now(), periods=days, freq='D')
    features = compute_solar_features(future_dates)
    X = poly.transform(features)
    predictions = model.predict(X)
    
    # Clamp to reasonable range
    predictions = np.clip(predictions, 0, 6000)
    
    return pd.DataFrame({
        'date': future_dates.date,
        'predicted_avg_power_w': predictions.round(0),
        'predicted_daily_kwh': (predictions * 8 / 1000).round(1)  # Rough: avg power × ~8 peak hours
    })


def generate_forecast_plot(historical_df: pd.DataFrame, forecast_df: pd.DataFrame,
                           output_path: str = 'solar_forecast.png'):
    """Generate solar yield forecast visualization."""
    fig, ax = plt.subplots(figsize=(12, 6))
    
    if not historical_df.empty and 'total_power' in historical_df.columns:
        dates = pd.to_datetime(historical_df['_time'])
        ax.plot(dates, historical_df['total_power'], 'o-', alpha=0.5,
                markersize=3, color='#f39c12', label='Historical (avg W)')
    
    forecast_dates = pd.to_datetime(forecast_df['date'])
    ax.bar(forecast_dates, forecast_df['predicted_avg_power_w'],
           alpha=0.7, color='#3498db', width=0.8, label='Forecast (avg W)')
    
    ax.set_xlabel('Date')
    ax.set_ylabel('Average Solar Power (W)')
    ax.set_title('Casa DaVinci — Solar Yield Forecast')
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print(f"[OK] Forecast plot saved: {output_path}")


def main(history_days: int = 90, forecast_days: int = 7):
    """Run solar yield prediction pipeline."""
    print("=" * 60)
    print("  Casa DaVinci — Solar Yield Prediction")
    print(f"  Training data: last {history_days} days")
    print(f"  Forecast: next {forecast_days} days")
    print("=" * 60)
    
    client = get_influx_client()
    
    # Query historical data
    print("\n[1/3] Querying historical solar data...")
    df = query_daily_yields(client, history_days)
    
    # Combine both MPPT outputs
    power_cols = [c for c in df.columns if 'Power' in str(c) or 'power' in str(c)]
    if power_cols:
        df['total_power'] = df[power_cols].sum(axis=1)
    print(f"  → {len(df)} daily records")
    
    # Train model
    print("\n[2/3] Training prediction model...")
    model, poly, metrics = train_prediction_model(df)
    
    if model is None:
        print("  ❌ Cannot generate forecast — insufficient data")
        client.close()
        return
    
    # Generate forecast
    print(f"\n[3/3] Generating {forecast_days}-day forecast...")
    forecast = predict_next_days(model, poly, forecast_days)
    
    print("\n  📊 Forecast:")
    print(forecast.to_string(index=False))
    
    # Plot
    output_dir = os.path.dirname(os.path.abspath(__file__))
    generate_forecast_plot(df, forecast, os.path.join(output_dir, 'solar_forecast.png'))
    
    client.close()
    return forecast


if __name__ == '__main__':
    main()
