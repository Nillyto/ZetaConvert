# ZetaConvert · Dev Preview (Docker)

Levanta TODO en un contenedor con hot-reload.

## Requisitos
- Docker Desktop (Windows/Mac) o Docker Engine (Linux)
- Que tu repo tenga `main.py`, `templates/`, `static/`, `engines/`, `requirements.txt`

## Uso
1) Copiá estos archivos al root del proyecto:
   - `Dockerfile.dev`
   - `docker-compose.yml`
   - `.env.sample`
   - `run-dev.sh`
   - `README_preview.md`

2) Crear `.env` (o lo hace el script):
```bash
cp -n .env.sample .env
```

3) Iniciar (Linux/Mac):
```bash
bash run-dev.sh
```
Windows (PowerShell con WSL o Git Bash):
```powershell
bash run-dev.sh
```
O directo:
```powershell
docker compose up --build
```

4) Abrí: http://localhost:8000

## Notas
- Hot-reload: cualquier cambio en `main.py`, `templates`, `static` se refleja al toque.
- Si el port 8000 está ocupado, cambia `PORT` en `.env`.

## Producción
Este stack es para desarrollo. En producción usá Gunicorn/Uvicorn workers sin `--reload` y reverse proxy.