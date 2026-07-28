from pathlib import Path
from datetime import datetime, timezone
import shutil
import subprocess

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.repositories.backup import BackupRepository
from app.config import BASE_DIR, settings


def _pg_args():
    url = settings.DATABASE_URL
    if not url.startswith("postgresql"):
        return None
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        return {
            "host": p.hostname or "localhost",
            "port": str(p.port or 5432),
            "user": p.username or "postgres",
            "password": p.password or "",
            "dbname": (p.path or "").lstrip("/") or "postgres",
        }
    except Exception:
        return None


def _pg_env():
    args = _pg_args()
    if not args:
        return None
    env = {
        "PGHOST": args["host"],
        "PGPORT": args["port"],
        "PGUSER": args["user"],
        "PGPASSWORD": args["password"],
        "PGDATABASE": args["dbname"],
    }
    return env


def _backup_to_dict(b) -> dict:
    return {
        "id": b.id,
        "filename": b.filename,
        "file_name": b.filename,
        "filepath": b.filepath,
        "size": getattr(b, "size_bytes", 0) or 0,
        "file_size": getattr(b, "size_bytes", 0) or 0,
        "size_bytes": getattr(b, "size_bytes", 0) or 0,
        "status": b.status or "completed",
        "backup_type": getattr(b, "backup_type", "manual") or "manual",
        "created_by": None,
        "created_at": b.created_at.isoformat() if getattr(b, "created_at", None) else None,
        "updated_at": b.updated_at.isoformat() if getattr(b, "updated_at", None) else None,
    }


class BackupService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = BackupRepository(db)

    def _find_backup_on_disk(self, backup_or_id) -> Path | None:
        candidates = []
        if hasattr(backup_or_id, "filename"):
            candidates.append(Path(backup_or_id.filepath) if backup_or_id.filepath else None)
            backups_dir = BASE_DIR / "backups"
            if backup_or_id.filename:
                candidates.append(backups_dir / backup_or_id.filename)
        else:
            backups_dir = BASE_DIR / "backups"
            if backups_dir.exists():
                for f in backups_dir.iterdir():
                    if f.is_file() and f.suffix in (".db", ".sqlite", ".sqlite3", ".sql"):
                        stem = f.stem
                        if backup_or_id in stem or stem.endswith(backup_or_id):
                            candidates.append(f)
        for p in candidates:
            if p and Path(p).exists():
                return Path(p)
        return None

    def rescan_disk(self) -> int:
        backups_dir = BASE_DIR / "backups"
        if not backups_dir.exists():
            return 0
        existing_in_db = {b.filename: b for b in self.repo.db.query(self.repo.model).all()}
        added = 0
        for f in sorted(backups_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not f.is_file() or f.suffix not in (".db", ".sqlite", ".sqlite3", ".sql"):
                continue
            if f.name in existing_in_db:
                continue
            try:
                size = f.stat().st_size
            except Exception:
                size = 0
            backup_type = "manual"
            if f.name.startswith("imported_"):
                backup_type = "imported"
            data = {
                "filename": f.name,
                "filepath": str(f),
                "size_bytes": size,
                "status": "completed",
                "backup_type": backup_type,
            }
            self.repo.create(data)
            added += 1
        return added

    def get_all(self, skip: int = 0, limit: int = 100):
        try:
            self.rescan_disk()
        except Exception:
            pass
        records = self.repo.get_all(skip=skip, limit=limit)
        return [_backup_to_dict(b) for b in records]

    def get_by_id(self, backup_id: str):
        backup = self.repo.get(backup_id)
        if not backup:
            try:
                self.rescan_disk()
            except Exception:
                pass
            backup = self.repo.get(backup_id)
        if not backup:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")
        return backup

    def create(self):
        backups_dir = BASE_DIR / "backups"
        backups_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"hr_crm_backup_{timestamp}.sql"
        backup_path = backups_dir / backup_filename

        env = _pg_env()
        if env:
            with open(backup_path, "wb") as f:
                result = subprocess.run(
                    ["pg_dump", env["PGDATABASE"]],
                    env={**__import__("os").environ, **env},
                    stdout=f,
                    stderr=subprocess.PIPE,
                )
            if result.returncode != 0:
                try:
                    backup_path.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail=f"pg_dump failed: {result.stderr.decode()}")
        else:
            db_path = BASE_DIR / "hr_crm.db"
            if not db_path.exists():
                raise HTTPException(status_code=500, detail="Database file not found for backup")
            shutil.copy2(db_path, backup_path)

        size_bytes = backup_path.stat().st_size

        data = {
            "filename": backup_filename,
            "filepath": str(backup_path),
            "size_bytes": size_bytes,
            "status": "completed",
            "backup_type": "manual",
        }
        b = self.repo.create(data)
        return _backup_to_dict(b)

    def create_and_download(self):
        backup = self.create()
        filepath = Path(backup["filepath"])

        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Backup file not found on disk")

        from fastapi.responses import FileResponse
        return FileResponse(
            path=str(filepath),
            filename=backup["filename"],
            media_type="application/octet-stream"
        )

    def restore(self, backup_id: str):
        backup = self.get_by_id(backup_id)
        backup_path = Path(backup.filepath) if backup.filepath else None
        if not backup_path or not backup_path.exists():
            backup_path = self._find_backup_on_disk(backup)
        if not backup_path:
            raise HTTPException(status_code=404, detail="Backup file not found on disk")

        env = _pg_env()
        if env:
            sql_content = backup_path.read_text(encoding="utf-8", errors="ignore")
            sql_content = "\n".join(
                line for line in sql_content.splitlines()
                if "transaction_timeout" not in line.lower()
            )
            with open(backup_path, "w", encoding="utf-8") as f:
                f.write(sql_content)

            terminate_sql = f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{env['PGDATABASE']}' AND pid <> pg_backend_pid();"
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", terminate_sql],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", f"DROP DATABASE IF EXISTS {env['PGDATABASE']};"],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", f"CREATE DATABASE {env['PGDATABASE']} OWNER {env['PGUSER']};"],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            result = subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-f", str(backup_path), env["PGDATABASE"]],
                env={**__import__("os").environ, **env},
                stderr=subprocess.PIPE,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"psql restore failed: {result.stderr.decode()}")
        else:
            db_path = BASE_DIR / "hr_crm.db"
            shutil.copy2(backup_path, db_path)

        try:
            from app.database import engine
            engine.dispose()
        except Exception:
            pass
        return True

    def import_and_restore(self, filename: str, file_bytes: bytes):
        backups_dir = BASE_DIR / "backups"
        backups_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        saved_filename = f"imported_{timestamp}_{filename}"
        backup_path = backups_dir / saved_filename

        with open(backup_path, "wb") as f:
            f.write(file_bytes)

        env = _pg_env()
        if env and backup_path.suffix.lower() == ".sql":
            sql_content = backup_path.read_text(encoding="utf-8", errors="ignore")
            sql_content = "\n".join(
                line for line in sql_content.splitlines()
                if "transaction_timeout" not in line.lower()
            )
            with open(backup_path, "w", encoding="utf-8") as f:
                f.write(sql_content)

            terminate_sql = f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{env['PGDATABASE']}' AND pid <> pg_backend_pid();"
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", terminate_sql],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", f"DROP DATABASE IF EXISTS {env['PGDATABASE']};"],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", f"CREATE DATABASE {env['PGDATABASE']} OWNER {env['PGUSER']};"],
                env={**__import__("os").environ, **env},
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            result = subprocess.run(
                ["psql", "-v", "ON_ERROR_STOP=1", "-f", str(backup_path), env["PGDATABASE"]],
                env={**__import__("os").environ, **env},
                stderr=subprocess.PIPE,
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"psql restore failed: {result.stderr.decode()}")
        else:
            db_path = BASE_DIR / "hr_crm.db"
            shutil.copy2(backup_path, db_path)

        try:
            from app.database import engine
            engine.dispose()
        except Exception:
            pass

        try:
            data = {
                "filename": saved_filename,
                "filepath": str(backup_path),
                "size_bytes": len(file_bytes),
                "status": "completed",
                "backup_type": "imported",
            }
            b = self.repo.create(data)
            return _backup_to_dict(b)
        except Exception:
            return {
                "id": "",
                "filename": saved_filename,
                "file_name": saved_filename,
                "filepath": str(backup_path),
                "size": len(file_bytes),
                "file_size": len(file_bytes),
                "size_bytes": len(file_bytes),
                "status": "completed",
                "backup_type": "imported",
                "created_by": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

    def update(self, backup_id: str, data: dict):
        backup = self.repo.get(backup_id)
        if not backup:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")
        b = self.repo.update(backup_id, data)
        return _backup_to_dict(b)

    def delete(self, backup_id: str):
        backup = self.repo.get(backup_id)
        if not backup:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found")
        if backup.filepath and Path(backup.filepath).exists():
            try:
                Path(backup.filepath).unlink()
            except Exception:
                pass
        return self.repo.hard_delete(backup_id)
