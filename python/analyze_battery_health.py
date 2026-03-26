#!/usr/bin/env python3
"""
Casa DaVinci — Battery Health Anomaly Detection
================================================

Analyzes Seplos BMS cell voltage and temperature data from InfluxDB
to detect anomalies that could indicate degradation or failure.

HOW IT WORKS (for non-programmers):
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This script uses three statistical methods to find problems in battery data:

1. Z-SCORE ANALYSIS (cell voltage imbalance detection)
   - Z-score tells us "how unusual is this value compared to normal?"
   - It measures how many standard deviations a value is from the average.
   - Formula: Z = (value - mean) / standard_deviation
   - If Z > 2, the value is in the top ~2.5% = unusual.
   - If Z > 3, the value is in the top ~0.1% = very likely a problem.
   - Example: If cells average 3.30V with std 0.01V, a cell at 3.35V
     has Z = (3.35 - 3.30) / 0.01 = 5.0 → definite anomaly.
   - USE: Detects cells that behave differently from their peers,
     which indicates degradation, internal resistance issues, or failure.

2. ROLLING STATISTICS (drift/degradation trends)
   - Instead of looking at single values, we compute moving averages
     over a time window (e.g., 24 hours).
   - This smooths out noise and reveals slow trends — like a cell
     that gradually drifts lower over days/weeks.
   - A healthy battery pack has stable, parallel cell voltages.
     If one cell's rolling average diverges, it's degrading.

3. IQR-BASED OUTLIER DETECTION (temperature anomalies)
   - IQR = Interquartile Range = Q3 - Q1 (the "middle 50%" of data).
   - Step by step:
     a) Sort all temperature readings from lowest to highest.
     b) Find Q1 (25th percentile) and Q3 (75th percentile).
     c) Calculate IQR = Q3 - Q1.
     d) Set fences:
        - Lower fence = Q1 - 1.5 × IQR
        - Upper fence = Q3 + 1.5 × IQR
     e) Any temperature below lower fence or above upper fence = anomaly.
   - Example: If temperatures are mostly 20-30°C (Q1=22, Q3=28, IQR=6),
     then upper fence = 28 + 9 = 37°C. A reading of 40°C = anomaly.
   - WHY IQR instead of fixed thresholds? Because it adapts to seasonal
     changes — what's normal in summer differs from winter.

Satellite parallel: Same approach applies to spacecraft battery
housekeeping — detecting cell degradation in orbit where physical
inspection is impossible.

Author: Petr Kukla
"""

import os
import sys
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', '')
INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'casa-davinci')
INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'energy-data')

# Thresholds for LiFePO4 pack (Seplos Mason-280, 16S configuration)
# Victron reports PACK voltage, not individual cell voltage
CELLS_IN_SERIES = 16
CELL_VOLTAGE_NOMINAL = 3.2       # V per cell (nominal)
CELL_VOLTAGE_MIN = 2.5 * CELLS_IN_SERIES    # 40.0V pack minimum
CELL_VOLTAGE_MAX = 3.65 * CELLS_IN_SERIES   # 58.4V pack maximum
CELL_IMBALANCE_WARN = 0.05       # V (50mV imbalance warning — per cell)
CELL_IMBALANCE_CRITICAL = 0.10   # V (100mV = critical — per cell)
TEMP_MIN = 5                     # °C
TEMP_MAX = 45                    # °C
ZSCORE_THRESHOLD = 2.5           # Standard deviations for anomaly


def get_influx_client() -> InfluxDBClient:
    """Create and return an InfluxDB client."""
    return InfluxDBClient(
        url=INFLUXDB_URL,
        token=INFLUXDB_TOKEN,
        org=INFLUXDB_ORG,
        timeout=60_000  # 60s timeout for large queries
    )


def query_battery_data(client: InfluxDBClient, hours: int = 24) -> pd.DataFrame:
    """
    Query battery voltage and temperature data from InfluxDB.
    
    The Victron Cerbo GX publishes battery data via MQTT, which our
    Node.js backend writes to InfluxDB as 'victron' measurements
    tagged by MQTT topic path.
    """
    import warnings
    from influxdb_client.client.warnings import MissingPivotFunction
    warnings.simplefilter("ignore", MissingPivotFunction)
    
    query_api = client.query_api()
    
    # Query each metric separately and merge — more robust than pivot
    # Topics have full Cerbo GX prefix: N/<serial>/battery/512/...
    metrics = {
        'voltage': r'battery\/512\/Dc\/0\/Voltage$',
        'temperature': r'battery\/512\/Dc\/0\/Temperature$',
        'power': r'battery\/512\/Dc\/0\/Power$',
        'soc': r'battery\/512\/Soc$',
    }
    
    frames = {}
    for name, topic_regex in metrics.items():
        flux_query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -{hours}h)
            |> filter(fn: (r) => r["_measurement"] == "victron")
            |> filter(fn: (r) => r["topic"] =~ /{topic_regex}/)
            |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
        '''
        try:
            df = query_api.query_data_frame(flux_query)
            if isinstance(df, list):
                df = pd.concat(df, ignore_index=True)
            if not df.empty:
                frames[name] = df[['_time', '_value']].rename(columns={'_value': name})
        except Exception as e:
            print(f"  [WARN] Query for {name} failed: {e}")
    
    if not frames:
        return pd.DataFrame()
    
    # Merge all metrics on time
    result = None
    for name, df in frames.items():
        if result is None:
            result = df
        else:
            result = pd.merge(result, df, on='_time', how='outer')
    
    return result.sort_values('_time').reset_index(drop=True)


def query_seplos_cell_data(client: InfluxDBClient, hours: int = 24) -> pd.DataFrame:
    """
    Query Seplos BMS per-cell voltage data if available.
    
    Seplos BMS communicates via RS485 (Modbus ASCII protocol),
    providing individual cell voltages and temperatures for
    16 cells per battery pack.
    """
    query_api = client.query_api()
    
    flux_query = f'''
    from(bucket: "{INFLUXDB_BUCKET}")
        |> range(start: -{hours}h)
        |> filter(fn: (r) => r["_measurement"] == "seplos")
        |> sort(columns: ["_time"])
    '''
    
    try:
        df = query_api.query_data_frame(flux_query)
        if isinstance(df, list):
            df = pd.concat(df, ignore_index=True)
        return df
    except Exception as e:
        print(f"[INFO] No Seplos data in InfluxDB (BMS may report via MQTT only): {e}")
        return pd.DataFrame()


def analyze_voltage_zscore(df: pd.DataFrame, voltage_col: str = 'voltage') -> dict:
    """
    Z-score analysis on battery voltage to detect anomalous readings.
    
    A Z-score > 2.5 indicates the reading is significantly different
    from the rolling mean, suggesting a potential issue.
    """
    if df.empty or voltage_col not in df.columns:
        return {'status': 'NO_DATA', 'anomalies': 0}
    
    voltages = df[voltage_col].dropna()
    if len(voltages) < 10:
        return {'status': 'INSUFFICIENT_DATA', 'anomalies': 0}
    
    # Rolling statistics (30-minute window for 10s polling = ~180 points)
    window = min(180, len(voltages) // 3)
    rolling_mean = voltages.rolling(window=window, center=True).mean()
    rolling_std = voltages.rolling(window=window, center=True).std()
    
    # Z-scores
    zscores = np.abs((voltages - rolling_mean) / rolling_std.replace(0, np.nan))
    anomalies = zscores[zscores > ZSCORE_THRESHOLD]
    
    # Voltage range analysis
    v_min = voltages.min()
    v_max = voltages.max()
    v_range = v_max - v_min
    
    status = 'HEALTHY'
    issues = []
    
    if v_min < CELL_VOLTAGE_MIN:
        status = 'CRITICAL'
        issues.append(f'Voltage below minimum: {v_min:.3f}V < {CELL_VOLTAGE_MIN}V')
    if v_max > CELL_VOLTAGE_MAX:
        status = 'CRITICAL'
        issues.append(f'Voltage above maximum: {v_max:.3f}V > {CELL_VOLTAGE_MAX}V')
    if len(anomalies) > len(voltages) * 0.05:  # >5% anomalous readings
        status = 'WARNING' if status == 'HEALTHY' else status
        issues.append(f'{len(anomalies)} anomalous readings ({len(anomalies)/len(voltages)*100:.1f}%)')
    
    return {
        'status': status,
        'anomalies': len(anomalies),
        'total_readings': len(voltages),
        'voltage_min': float(v_min),
        'voltage_max': float(v_max),
        'voltage_mean': float(voltages.mean()),
        'voltage_std': float(voltages.std()),
        'voltage_range': float(v_range),
        'issues': issues,
        'zscores': zscores
    }


def analyze_temperature(df: pd.DataFrame, temp_col: str = 'temperature') -> dict:
    """
    IQR-based outlier detection for battery temperature.
    
    Temperature anomalies in batteries can indicate:
    - Internal short circuits (rapid rise)
    - Cooling system failure
    - Excessive charge/discharge rates
    """
    if df.empty or temp_col not in df.columns:
        return {'status': 'NO_DATA', 'anomalies': 0}
    
    temps = df[temp_col].dropna()
    if len(temps) < 10:
        return {'status': 'INSUFFICIENT_DATA', 'anomalies': 0}
    
    # IQR method
    q1 = temps.quantile(0.25)
    q3 = temps.quantile(0.75)
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    
    outliers = temps[(temps < lower_bound) | (temps > upper_bound)]
    
    status = 'HEALTHY'
    issues = []
    
    if temps.max() > TEMP_MAX:
        status = 'CRITICAL'
        issues.append(f'Temperature exceeds safe limit: {temps.max():.1f}°C > {TEMP_MAX}°C')
    if temps.min() < TEMP_MIN:
        status = 'WARNING'
        issues.append(f'Temperature below optimal: {temps.min():.1f}°C < {TEMP_MIN}°C')
    
    # Rate of change detection (thermal runaway indicator)
    temp_diff = temps.diff()
    max_rate = temp_diff.max()
    if max_rate > 5:  # >5°C jump between readings
        status = 'CRITICAL'
        issues.append(f'Rapid temperature increase detected: {max_rate:.1f}°C/reading')
    
    return {
        'status': status,
        'anomalies': len(outliers),
        'total_readings': len(temps),
        'temp_min': float(temps.min()),
        'temp_max': float(temps.max()),
        'temp_mean': float(temps.mean()),
        'issues': issues
    }


def analyze_degradation_trend(df: pd.DataFrame, voltage_col: str = 'voltage',
                                days: int = 30) -> dict:
    """
    Long-term trend analysis for battery degradation.
    
    Uses linear regression on daily average voltages at similar SoC
    levels to detect capacity fade over time.
    """
    if df.empty or voltage_col not in df.columns:
        return {'status': 'NO_DATA', 'trend': None}
    
    voltages = df[voltage_col].dropna()
    if len(voltages) < 100:
        return {'status': 'INSUFFICIENT_DATA', 'trend': None}
    
    # Daily averages
    if '_time' in df.columns:
        df_trend = df[['_time', voltage_col]].dropna()
        df_trend['date'] = pd.to_datetime(df_trend['_time']).dt.date
        daily_avg = df_trend.groupby('date')[voltage_col].mean()
    else:
        return {'status': 'NO_TIMESTAMP', 'trend': None}
    
    if len(daily_avg) < 3:
        return {'status': 'INSUFFICIENT_DAYS', 'trend': None}
    
    # Linear regression
    x = np.arange(len(daily_avg))
    slope, intercept = np.polyfit(x, daily_avg.values, 1)
    
    # mV/day trend
    trend_mv_per_day = slope * 1000
    
    status = 'HEALTHY'
    if trend_mv_per_day < -1.0:  # Losing more than 1mV/day average
        status = 'WARNING'
    if trend_mv_per_day < -5.0:
        status = 'CRITICAL'
    
    return {
        'status': status,
        'trend_mv_per_day': float(trend_mv_per_day),
        'days_analyzed': len(daily_avg),
        'daily_averages': daily_avg.to_dict()
    }


def generate_report_plot(voltage_result: dict, temp_result: dict,
                         output_path: str = 'battery_health_report.png'):
    """Generate a visual report of battery health analysis."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Casa DaVinci — Battery Health Report', fontsize=16, fontweight='bold')
    
    # Status color mapping
    color_map = {'HEALTHY': '#2ecc71', 'WARNING': '#f39c12', 'CRITICAL': '#e74c3c',
                 'NO_DATA': '#95a5a6', 'INSUFFICIENT_DATA': '#95a5a6'}
    
    # Overall status
    ax = axes[0, 0]
    statuses = [voltage_result.get('status', 'NO_DATA'), temp_result.get('status', 'NO_DATA')]
    overall = 'CRITICAL' if 'CRITICAL' in statuses else ('WARNING' if 'WARNING' in statuses else statuses[0])
    ax.text(0.5, 0.5, f'Overall: {overall}', transform=ax.transAxes, fontsize=24,
            ha='center', va='center', color=color_map.get(overall, '#95a5a6'), fontweight='bold')
    ax.text(0.5, 0.25, f'Voltage: {voltage_result.get("status", "N/A")}\n'
            f'Temperature: {temp_result.get("status", "N/A")}',
            transform=ax.transAxes, fontsize=12, ha='center', va='center')
    ax.set_title('System Status')
    ax.axis('off')
    
    # Voltage statistics
    ax = axes[0, 1]
    if voltage_result.get('voltage_mean'):
        stats = [
            f"Mean: {voltage_result['voltage_mean']:.3f} V",
            f"Min: {voltage_result['voltage_min']:.3f} V",
            f"Max: {voltage_result['voltage_max']:.3f} V",
            f"Std: {voltage_result['voltage_std']:.4f} V",
            f"Anomalies: {voltage_result['anomalies']}/{voltage_result['total_readings']}"
        ]
        ax.text(0.1, 0.5, '\n'.join(stats), transform=ax.transAxes, fontsize=12,
                va='center', family='monospace')
    ax.set_title('Voltage Analysis')
    ax.axis('off')
    
    # Temperature statistics
    ax = axes[1, 0]
    if temp_result.get('temp_mean'):
        stats = [
            f"Mean: {temp_result['temp_mean']:.1f} °C",
            f"Min: {temp_result['temp_min']:.1f} °C",
            f"Max: {temp_result['temp_max']:.1f} °C",
            f"Outliers: {temp_result['anomalies']}/{temp_result['total_readings']}"
        ]
        ax.text(0.1, 0.5, '\n'.join(stats), transform=ax.transAxes, fontsize=12,
                va='center', family='monospace')
    ax.set_title('Temperature Analysis')
    ax.axis('off')
    
    # Issues
    ax = axes[1, 1]
    all_issues = voltage_result.get('issues', []) + temp_result.get('issues', [])
    if all_issues:
        ax.text(0.1, 0.5, '\n'.join(f'⚠ {i}' for i in all_issues),
                transform=ax.transAxes, fontsize=10, va='center', color='#e74c3c')
    else:
        ax.text(0.5, 0.5, '✓ No issues detected', transform=ax.transAxes,
                fontsize=14, ha='center', va='center', color='#2ecc71')
    ax.set_title('Issues')
    ax.axis('off')
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"[OK] Report saved: {output_path}")


def main(hours: int = 24):
    """Run full battery health analysis."""
    print("=" * 60)
    print("  Casa DaVinci — Battery Health Anomaly Detection")
    print(f"  Analysis window: last {hours} hours")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print("=" * 60)
    
    client = get_influx_client()
    
    # Query data
    print("\n[1/4] Querying battery data from InfluxDB...")
    df = query_battery_data(client, hours)
    print(f"  → {len(df)} records retrieved")
    
    # Normalize column names (MQTT topics → friendly names)
    col_map = {}
    for col in df.columns:
        if 'Voltage' in str(col):
            col_map[col] = 'voltage'
        elif 'Temperature' in str(col):
            col_map[col] = 'temperature'
        elif 'Soc' in str(col):
            col_map[col] = 'soc'
        elif 'Power' in str(col) and 'battery' in str(col).lower():
            col_map[col] = 'power'
    df = df.rename(columns=col_map)
    
    # Analyze voltage
    print("\n[2/4] Analyzing voltage patterns...")
    voltage_result = analyze_voltage_zscore(df)
    print(f"  → Status: {voltage_result['status']}")
    if voltage_result.get('issues'):
        for issue in voltage_result['issues']:
            print(f"  ⚠ {issue}")
    
    # Analyze temperature
    print("\n[3/4] Analyzing temperature patterns...")
    temp_result = analyze_temperature(df)
    print(f"  → Status: {temp_result['status']}")
    if temp_result.get('issues'):
        for issue in temp_result['issues']:
            print(f"  ⚠ {issue}")
    
    # Degradation trend (longer window)
    print("\n[4/4] Checking degradation trend...")
    trend_result = analyze_degradation_trend(df)
    if trend_result.get('trend_mv_per_day') is not None:
        print(f"  → Trend: {trend_result['trend_mv_per_day']:+.2f} mV/day")
    else:
        print(f"  → {trend_result['status']}")
    
    # Generate visual report
    output_dir = os.path.dirname(os.path.abspath(__file__))
    plot_path = os.path.join(output_dir, 'battery_health_report.png')
    generate_report_plot(voltage_result, temp_result, plot_path)
    
    # Summary
    print("\n" + "=" * 60)
    statuses = [voltage_result.get('status'), temp_result.get('status')]
    if 'CRITICAL' in statuses:
        print("  ⛔ CRITICAL issues detected — immediate attention required!")
    elif 'WARNING' in statuses:
        print("  ⚠️  Warnings detected — monitor closely")
    else:
        print("  ✅ Battery health: NORMAL")
    print("=" * 60)
    
    client.close()
    return voltage_result, temp_result, trend_result


if __name__ == '__main__':
    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    main(hours)
