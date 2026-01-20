#!/bin/bash
# Logs system storage stats to InfluxDB every hour (via cron)
# Cron: 0 * * * * /home/pi/casa-davinci/backend/log-storage.sh

INFLUX_TOKEN="uo4-ieF7EucCPn_9kkTzb7FaCda6u9-a8M9PuGwnBy3QtRbhnHWqLspEPTQVIm9DkLdrwf8RXoMZsmHxsOKEew=="

# Get disk usage percentage
DISK_USED=$(df / | awk "NR==2 {print \$5}" | tr -d "%")
DISK_AVAIL_GB=$(df -BG / | awk "NR==2 {print \$4}" | tr -d "G")

# Get InfluxDB size in MB
INFLUX_SIZE_MB=$(sudo du -sm /var/lib/influxdb 2>/dev/null | cut -f1)

# Get memory usage
MEM_USED_PCT=$(free | awk "/Mem:/ {printf \"%.0f\", \$3/\$2 * 100}")
MEM_AVAIL_MB=$(free -m | awk "/Mem:/ {print \$7}")

# Write to InfluxDB
curl -s -X POST "http://localhost:8086/api/v2/write?org=casa-davinci&bucket=energy-data&precision=s" \
  -H "Authorization: Token $INFLUX_TOKEN" \
  -d "system,host=raspberrypi disk_used_pct=${DISK_USED},disk_avail_gb=${DISK_AVAIL_GB},influx_size_mb=${INFLUX_SIZE_MB},mem_used_pct=${MEM_USED_PCT},mem_avail_mb=${MEM_AVAIL_MB}"
