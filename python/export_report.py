#!/usr/bin/env python3
"""
Casa DaVinci — Automated PDF Report Generator
==============================================

Generates daily/weekly energy reports from InfluxDB data
as PDF documents with charts and statistics.

Satellite parallel: Automated pass report generation —
after each ground station contact, a summary report is
generated with telemetry statistics, anomalies, and trends.

Author: Petr Kukla
"""

import os
import sys
from datetime import datetime, timedelta
from io import BytesIO

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', '')
INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'casa-davinci')
INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'energy-data')


def get_influx_client() -> InfluxDBClient:
    return InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)


def query_energy_summary(client: InfluxDBClient, hours: int = 24) -> dict:
    """Query energy metrics summary for the report period."""
    query_api = client.query_api()
    summary = {}
    
    metrics = {
        'solar': ('solarcharger/27[89]/Yield/Power', 'sum'),
        'grid': ('grid/30/Ac/Power', 'mean'),
        'consumption': ('vebus/276/Ac/Out/P', 'mean'),
        'battery_soc': ('battery/512/Soc', 'mean'),
        'battery_voltage': ('battery/512/Dc/0/Voltage', 'mean'),
    }
    
    for name, (topic_pattern, agg) in metrics.items():
        flux_query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -{hours}h)
            |> filter(fn: (r) => r["_measurement"] == "victron")
            |> filter(fn: (r) => r["topic"] =~ /{topic_pattern.replace("/", "\\/")}/)
            |> {agg}()
        '''
        try:
            tables = query_api.query(flux_query)
            values = [r.get_value() for t in tables for r in t.records if r.get_value() is not None]
            if values:
                summary[name] = {
                    'value': sum(values) if agg == 'sum' else np.mean(values),
                    'count': len(values)
                }
        except Exception:
            pass
    
    return summary


def create_energy_chart(client: InfluxDBClient, hours: int = 24) -> BytesIO:
    """Create energy flow chart for the report."""
    query_api = client.query_api()
    
    flux_query = f'''
    from(bucket: "{INFLUXDB_BUCKET}")
        |> range(start: -{hours}h)
        |> filter(fn: (r) => r["_measurement"] == "victron")
        |> filter(fn: (r) => 
            r["topic"] =~ /solarcharger\\/27[89]\\/Yield\\/Power/ or
            r["topic"] =~ /grid\\/30\\/Ac\\/Power/ or
            r["topic"] =~ /vebus\\/276\\/Ac\\/Out\\/P/
        )
        |> aggregateWindow(every: 15m, fn: mean, createEmpty: false)
        |> pivot(rowKey: ["_time"], columnKey: ["topic"], valueColumn: "_value")
    '''
    
    try:
        df = query_api.query_data_frame(flux_query)
        if isinstance(df, list):
            df = pd.concat(df, ignore_index=True)
    except Exception:
        df = pd.DataFrame()
    
    fig, ax = plt.subplots(figsize=(8, 4))
    
    if not df.empty and '_time' in df.columns:
        times = pd.to_datetime(df['_time'])
        
        # Find and plot available columns
        for col in df.columns:
            if 'solarcharger' in str(col) and 'Power' in str(col):
                ax.fill_between(times, df[col].fillna(0), alpha=0.3, color='#f1c40f', label='Solar')
                ax.plot(times, df[col].fillna(0), color='#f39c12', linewidth=0.8)
            elif 'grid' in str(col):
                ax.plot(times, df[col].fillna(0), color='#e74c3c', linewidth=1, label='Grid')
            elif 'vebus' in str(col):
                ax.plot(times, df[col].fillna(0), color='#3498db', linewidth=1, label='Consumption')
    
    ax.set_xlabel('Time')
    ax.set_ylabel('Power (W)')
    ax.set_title(f'Energy Flow — Last {hours}h')
    ax.legend(loc='upper right')
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150)
    plt.close()
    buf.seek(0)
    return buf


def generate_pdf_report(summary: dict, chart_buf: BytesIO,
                        hours: int = 24, output_path: str = 'energy_report.pdf'):
    """Generate PDF report using ReportLab."""
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                           topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'],
                                  fontSize=20, spaceAfter=10)
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'],
                                     fontSize=12, textColor=colors.grey, spaceAfter=20)
    
    elements = []
    
    # Header
    elements.append(Paragraph('Casa DaVinci — Energy Report', title_style))
    period = f"Last {hours} hours — Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    elements.append(Paragraph(period, subtitle_style))
    elements.append(Spacer(1, 10*mm))
    
    # Summary table
    table_data = [['Metric', 'Value']]
    
    metric_labels = {
        'solar': ('Solar Production', 'W avg'),
        'grid': ('Grid Power', 'W avg'),
        'consumption': ('Home Consumption', 'W avg'),
        'battery_soc': ('Battery SoC', '%'),
        'battery_voltage': ('Battery Voltage', 'V'),
    }
    
    for key, (label, unit) in metric_labels.items():
        if key in summary:
            val = summary[key]['value']
            table_data.append([label, f"{val:.1f} {unit}"])
        else:
            table_data.append([label, 'N/A'])
    
    table = Table(table_data, colWidths=[80*mm, 60*mm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecf0f1')]),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 15*mm))
    
    # Energy chart
    elements.append(Paragraph('Energy Flow', styles['Heading2']))
    chart_img = Image(chart_buf, width=160*mm, height=80*mm)
    elements.append(chart_img)
    elements.append(Spacer(1, 10*mm))
    
    # System info
    elements.append(Paragraph('System Configuration', styles['Heading2']))
    sys_info = [
        ['Component', 'Details'],
        ['Inverter', 'Victron MultiPlus-II 48/5000'],
        ['MPPT Controllers', '2× Victron SmartSolar (ID 278, 279)'],
        ['Battery', '3× Seplos Mason-280 (LiFePO4, 840Ah total)'],
        ['Monitoring', 'Victron Cerbo GX → MQTT → Node.js → InfluxDB'],
        ['Visualization', 'Grafana 10.3 + Custom Dashboard'],
    ]
    sys_table = Table(sys_info, colWidths=[50*mm, 100*mm])
    sys_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(sys_table)
    
    # Build PDF
    doc.build(elements)
    print(f"[OK] PDF report saved: {output_path}")


def main(hours: int = 24):
    """Generate complete energy report."""
    print("=" * 60)
    print("  Casa DaVinci — Energy Report Generator")
    print(f"  Period: last {hours} hours")
    print("=" * 60)
    
    client = get_influx_client()
    
    print("\n[1/3] Querying energy summary...")
    summary = query_energy_summary(client, hours)
    
    print("[2/3] Generating energy chart...")
    chart_buf = create_energy_chart(client, hours)
    
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, f'energy_report_{datetime.now().strftime("%Y%m%d")}.pdf')
    
    print("[3/3] Building PDF report...")
    generate_pdf_report(summary, chart_buf, hours, output_path)
    
    client.close()
    print(f"\n✅ Report complete: {output_path}")


if __name__ == '__main__':
    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    main(hours)
