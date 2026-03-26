#!/usr/bin/env python3
"""
Casa DaVinci — Real-Time Telemetry Alerting
============================================

Monitors InfluxDB for threshold violations and generates alerts.
Designed as a polling daemon that checks latest readings against
configurable limits.

Satellite parallel: Identical to satellite housekeeping monitoring —
autonomous onboard alerting when telemetry exceeds safe operating
limits (voltage, temperature, current). In orbit, this triggers
safe mode; at home, it sends notifications.

Author: Petr Kukla
"""

import os
import sys
import time
import json
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional

from dotenv import load_dotenv
from influxdb_client import InfluxDBClient

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', '')
INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'casa-davinci')
INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'energy-data')


# ── Alert Thresholds ────────────────────────────────────────────
# Analogous to satellite housekeeping limits (OOL = Out Of Limits)

THRESHOLDS = {
    'battery_voltage': {
        'critical_low': 44.0,     # V (pack voltage, 16S × 2.75V)
        'warning_low': 48.0,      # V
        'warning_high': 56.0,     # V
        'critical_high': 58.4,    # V (16S × 3.65V)
        'unit': 'V'
    },
    'battery_temperature': {
        'critical_low': 0,        # °C
        'warning_low': 5,
        'warning_high': 40,
        'critical_high': 50,
        'unit': '°C'
    },
    'battery_soc': {
        'critical_low': 5,        # %
        'warning_low': 15,
        'warning_high': None,     # No upper warning
        'critical_high': None,
        'unit': '%'
    },
    'solar_power': {
        'critical_low': None,
        'warning_low': None,
        'warning_high': 5500,     # W (MPPT limit check)
        'critical_high': 6000,
        'unit': 'W'
    },
    'grid_power': {
        'critical_low': None,
        'warning_low': None,
        'warning_high': 4500,     # W (sustained high import)
        'critical_high': 5000,
        'unit': 'W'
    }
}


@dataclass
class Alert:
    """Single alert event."""
    timestamp: str
    metric: str
    value: float
    threshold: float
    level: str        # WARNING | CRITICAL
    direction: str    # HIGH | LOW
    message: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AlertState:
    """Tracks active alerts to avoid duplicate notifications."""
    active_alerts: dict = field(default_factory=dict)
    alert_history: list = field(default_factory=list)
    suppression_minutes: int = 15  # Don't re-alert same metric within N minutes

    def should_alert(self, metric: str, level: str) -> bool:
        key = f"{metric}_{level}"
        if key in self.active_alerts:
            last_alert = datetime.fromisoformat(self.active_alerts[key])
            if datetime.now() - last_alert < timedelta(minutes=self.suppression_minutes):
                return False
        return True

    def record_alert(self, alert: Alert):
        key = f"{alert.metric}_{alert.level}"
        self.active_alerts[key] = alert.timestamp
        self.alert_history.append(alert.to_dict())

    def clear_alert(self, metric: str, level: str):
        key = f"{metric}_{level}"
        self.active_alerts.pop(key, None)


def get_influx_client() -> InfluxDBClient:
    """Create and return an InfluxDB client."""
    return InfluxDBClient(
        url=INFLUXDB_URL,
        token=INFLUXDB_TOKEN,
        org=INFLUXDB_ORG,
        timeout=60_000
    )


def query_latest_metrics(client: InfluxDBClient) -> dict:
    """
    Query the most recent values for all monitored metrics.
    
    Uses InfluxDB's last() aggregate to get the freshest reading
    for each MQTT topic — same pattern as ground station querying
    the latest satellite telemetry frame.
    """
    query_api = client.query_api()
    
    metrics = {}
    
    # Battery metrics
    topic_map = {
        'battery_voltage': 'battery/512/Dc/0/Voltage',
        'battery_temperature': 'battery/512/Dc/0/Temperature',
        'battery_soc': 'battery/512/Soc',
        'battery_power': 'battery/512/Dc/0/Power',
        'solar_power_1': 'solarcharger/278/Yield/Power',
        'solar_power_2': 'solarcharger/279/Yield/Power',
        'grid_power': 'grid/30/Ac/Power',
        'consumption': 'vebus/276/Ac/Out/P',
    }
    
    for metric_name, topic_suffix in topic_map.items():
        flux_query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -7d)
            |> filter(fn: (r) => r["_measurement"] == "victron")
            |> filter(fn: (r) => r["topic"] =~ /{topic_suffix.replace("/", "\\/")}/)
            |> last()
        '''
        try:
            tables = query_api.query(flux_query)
            for table in tables:
                for record in table.records:
                    metrics[metric_name] = {
                        'value': record.get_value(),
                        'time': record.get_time().isoformat()
                    }
        except Exception as e:
            pass  # Metric not available
    
    # Combine solar chargers
    if 'solar_power_1' in metrics and 'solar_power_2' in metrics:
        metrics['solar_power'] = {
            'value': (metrics['solar_power_1']['value'] or 0) + 
                     (metrics['solar_power_2']['value'] or 0),
            'time': metrics['solar_power_1']['time']
        }
    
    return metrics


def check_thresholds(metrics: dict, state: AlertState) -> list:
    """
    Compare current values against thresholds and generate alerts.
    
    Four-level limit checking (like satellite OOL):
    - Critical Low  → immediate action required
    - Warning Low   → attention needed
    - Warning High  → attention needed
    - Critical High → immediate action required
    """
    new_alerts = []
    
    for metric_name, limits in THRESHOLDS.items():
        if metric_name not in metrics:
            continue
        
        value = metrics[metric_name]['value']
        if value is None:
            continue
        
        timestamp = datetime.now().isoformat()
        alert = None
        
        # Check critical low
        if limits.get('critical_low') is not None and value < limits['critical_low']:
            if state.should_alert(metric_name, 'CRITICAL'):
                alert = Alert(
                    timestamp=timestamp, metric=metric_name, value=value,
                    threshold=limits['critical_low'], level='CRITICAL', direction='LOW',
                    message=f"⛔ CRITICAL: {metric_name} = {value}{limits['unit']} "
                            f"(below {limits['critical_low']}{limits['unit']})"
                )
        # Check warning low
        elif limits.get('warning_low') is not None and value < limits['warning_low']:
            if state.should_alert(metric_name, 'WARNING'):
                alert = Alert(
                    timestamp=timestamp, metric=metric_name, value=value,
                    threshold=limits['warning_low'], level='WARNING', direction='LOW',
                    message=f"⚠️ WARNING: {metric_name} = {value}{limits['unit']} "
                            f"(below {limits['warning_low']}{limits['unit']})"
                )
        # Check critical high
        elif limits.get('critical_high') is not None and value > limits['critical_high']:
            if state.should_alert(metric_name, 'CRITICAL'):
                alert = Alert(
                    timestamp=timestamp, metric=metric_name, value=value,
                    threshold=limits['critical_high'], level='CRITICAL', direction='HIGH',
                    message=f"⛔ CRITICAL: {metric_name} = {value}{limits['unit']} "
                            f"(above {limits['critical_high']}{limits['unit']})"
                )
        # Check warning high
        elif limits.get('warning_high') is not None and value > limits['warning_high']:
            if state.should_alert(metric_name, 'WARNING'):
                alert = Alert(
                    timestamp=timestamp, metric=metric_name, value=value,
                    threshold=limits['warning_high'], level='WARNING', direction='HIGH',
                    message=f"⚠️ WARNING: {metric_name} = {value}{limits['unit']} "
                            f"(above {limits['warning_high']}{limits['unit']})"
                )
        else:
            # Value is normal — clear any active alerts
            state.clear_alert(metric_name, 'WARNING')
            state.clear_alert(metric_name, 'CRITICAL')
        
        if alert:
            state.record_alert(alert)
            new_alerts.append(alert)
    
    return new_alerts


def print_status(metrics: dict):
    """Print current system status summary."""
    print(f"\n{'─' * 50}")
    print(f"  Casa DaVinci Telemetry — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'─' * 50}")
    
    fmt = {
        'battery_voltage': ('Battery Voltage', 'V', '.1f'),
        'battery_soc': ('Battery SoC', '%', '.0f'),
        'battery_power': ('Battery Power', 'W', '.0f'),
        'battery_temperature': ('Battery Temp', '°C', '.1f'),
        'solar_power': ('Solar Total', 'W', '.0f'),
        'grid_power': ('Grid Power', 'W', '.0f'),
        'consumption': ('Consumption', 'W', '.0f'),
    }
    
    for key, (label, unit, spec) in fmt.items():
        if key in metrics and metrics[key]['value'] is not None:
            val = metrics[key]['value']
            print(f"  {label:<20s} {val:{spec}} {unit}")
        else:
            print(f"  {label:<20s} ---")
    print(f"{'─' * 50}")


def run_daemon(poll_interval: int = 30):
    """
    Run as a polling daemon — check metrics every N seconds.
    
    In a satellite context, this would be the onboard FDIR
    (Fault Detection, Isolation, Recovery) loop.
    """
    print("=" * 50)
    print("  Casa DaVinci — Telemetry Alerting Daemon")
    print(f"  Poll interval: {poll_interval}s")
    print("=" * 50)
    
    client = get_influx_client()
    state = AlertState()
    
    try:
        while True:
            metrics = query_latest_metrics(client)
            
            if not metrics:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] No data — waiting...")
                time.sleep(poll_interval)
                continue
            
            # Check thresholds
            alerts = check_thresholds(metrics, state)
            
            # Print status
            print_status(metrics)
            
            # Print alerts
            for alert in alerts:
                print(f"\n  🚨 {alert.message}")
            
            if not alerts:
                print("  ✅ All systems nominal")
            
            time.sleep(poll_interval)
            
    except KeyboardInterrupt:
        print("\n\nShutting down alerting daemon...")
    finally:
        client.close()


def run_once():
    """Single check — useful for cron jobs or testing."""
    client = get_influx_client()
    state = AlertState()
    
    metrics = query_latest_metrics(client)
    if not metrics:
        print("No data available from InfluxDB")
        return []
    
    alerts = check_thresholds(metrics, state)
    print_status(metrics)
    
    for alert in alerts:
        print(f"\n  🚨 {alert.message}")
    
    if not alerts:
        print("  ✅ All systems nominal")
    
    client.close()
    return alerts


if __name__ == '__main__':
    if '--daemon' in sys.argv:
        interval = int(sys.argv[sys.argv.index('--daemon') + 1]) if len(sys.argv) > sys.argv.index('--daemon') + 1 else 30
        run_daemon(interval)
    else:
        run_once()
