from datetime import datetime, timezone, timedelta

BD_TZ = timezone(timedelta(hours=6), name="Asia/Dhaka")


def get_bd_now() -> datetime:
    return datetime.now(BD_TZ)


def utc_to_bd(utc_dt: datetime) -> datetime:
    return utc_dt.replace(tzinfo=timezone.utc).astimezone(BD_TZ)
