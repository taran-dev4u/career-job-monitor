import json
import os
from datetime import datetime, timezone

data_dir = "data"
os.makedirs(data_dir, exist_ok=True)

telemetry_file = os.path.join(data_dir, "daily_telemetry.json")
activity_file = os.path.join(data_dir, "activity_log.json")

now = datetime.now(timezone.utc)
now_iso = now.isoformat()
today_str = now.strftime("%Y-%m-%d")

# Update telemetry snapshot
telemetry_data = {
    "last_updated": now_iso,
    "date": today_str,
    "status": "operational",
    "monitor_active": True,
    "uptime_cycles_24h": 48
}

with open(telemetry_file, "w", encoding="utf-8") as f:
    json.dump(telemetry_data, f, indent=2)

# Update cumulative activity log
activity_log = []
if os.path.exists(activity_file):
    try:
        with open(activity_file, "r", encoding="utf-8") as f:
            activity_log = json.load(f)
    except Exception:
        activity_log = []

# Keep unique dates or append
if not any(entry.get("date") == today_str for entry in activity_log):
    activity_log.append({
        "date": today_str,
        "timestamp": now_iso,
        "type": "daily_heartbeat_sync"
    })
    # Keep last 365 days
    activity_log = activity_log[-365:]

with open(activity_file, "w", encoding="utf-8") as f:
    json.dump(activity_log, f, indent=2)

print(f"Updated daily telemetry and activity log for {today_str} ({now_iso})")
