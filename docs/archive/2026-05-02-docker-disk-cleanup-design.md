# Docker disk cleanup — analysis & plan

Дата: 2026-05-02
Статус: ждёт отмашки от пользователя
Заменяет: memory `project_disk_cleanup_pending.md` (2026-04-25 «Docker VHDX 133 GB on C:»)

## TL;DR

- **VHDX на C:** `C:\Users\ikoch\AppData\Local\Docker\wsl\disk\docker_data.vhdx` = **130.17 GB**.
- Внутри Docker реально занято **~40 GB**, остальные **~90 GB — раздутый VHD не сжимается автоматически** (известный WSL2/Hyper-V foot-gun).
- Главный жирный объект — **образ `mushroom-map-web` 29.6 GB**, мёртвый (последний раз использовался 7 дней назад), технически чинится в одном `docker image rm`.
- Ожидаемый эффект полного cleanup'а: **~85-95 GB возвращаются на C:**.

## Текущее состояние

### Images

| Image | Tag | Size | Используется? |
|-------|-----|------|---|
| mushroom-map-web | latest | **29.6 GB** | НЕТ (контейнер `mushroom_web` Exited 4 days ago) |
| mushroom-map-api | latest | 1.03 GB | ДА |
| postgis/postgis | 16-3.4 | 853 MB | ДА (`mushroom_db`) |
| klokantech/tippecanoe | latest | 766 MB | Изредка (8 лет от роду) |
| python | 3.12-slim | 179 MB | base |
| ubuntu | 24.04, 22.04 | 119 + 119 MB | dangling |
| protomaps/go-pmtiles | latest | 81 MB | для tile builds |

### Volumes

| Volume | Size | Linked? |
|--------|------|---|
| `mushroom-map_pgdata` | **5.78 GB** | live (mushroom_db) — **не трогать** |
| 6 anonymous (UUID-имена) | ~466 MB | 0 LINKS — orphan |

### Containers

- `mushroom_db` — Up 2h, live.
- `mushroom_api` — Up 2h, live.
- `mushroom_web` — Exited 4 days ago, virtual 21.4 GB, образ уже dangling.

### Build cache

- 1.28 GB, последний раз использовался 7 дней назад. Все слои `Reclaimable: true`.

## Почему `mushroom-map-web` — 29.6 GB (аномалия)

[`apps/web/Dockerfile`](../../../apps/web/Dockerfile):

```dockerfile
FROM node:20-alpine
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
...
RUN npm ci --workspaces --include-workspace-root  # ← deps для ВСЕХ workspaces
COPY . .                                          # ← весь репо
```

Корни:
1. `npm ci --workspaces` ставит deps для всех workspaces, включая `apps/mobile` (RN + Expo SDK + maplibre-react-native). RN/Expo легко даёт 3-5 GB node_modules.
2. `COPY . .` тащит `apps/mobile/android/` (**678 MB** локального gradle/build cache) + `apps/mobile/node_modules` (82 MB). [`.dockerignore`](../../../.dockerignore) исключает `data/`, `node_modules`, `dist/`, но не `apps/mobile/android/build/`, `apps/mobile/android/.gradle/` etc.
3. Нет multi-stage. В образе остаётся весь dev-stack с Vite, ESLint, vitest.
4. Образ под dev-mode (`npm run dev --reload`) — для прода не годится, для dev по факту не нужен. CLAUDE.md явно: «web запускается на хосте, не в docker». Service `web` в профиле `full-web` который не поднимается.

Итог: артефакт ошибочной попытки 7 дней назад. Никем не используется.

## План cleanup'а — три уровня

### L1 — мгновенные prune-команды (~32 GB внутри Docker, VHDX не сожмётся)

```bash
docker rm mushroom_web                       # -21.4 GB virtual (контейнер)
docker image rm mushroom-map-web:latest      # -29.6 GB
docker volume prune -f                       # -466 MB (6 orphan volumes)
docker image rm ubuntu:24.04 ubuntu:22.04    # -238 MB
docker builder prune --all -f                # -1.28 GB build cache
docker system prune -f                       # ε (dangling tail)
```

Безопасно: всё перечисленное либо явно мёртвое (web), либо без LINKS (volumes), либо неиспользуемая base (ubuntu:24).

### L2 — опционально (~1.6 GB)

- `klokantech/tippecanoe:latest` (766 MB, 2017) — заменить в `pipelines/build_forest_tiles.sh` на `felt/tippecanoe:latest`, или дропнуть и тянуть on-demand.
- `protomaps/go-pmtiles:latest` (81 MB) — `docker run` притянет повторно при следующем билде тайлов.
- `python:3.12-slim` — оставить, base для будущих ad-hoc билдов.

### L3 — compact VHDX (~85-95 GB на C:)

Без L3 всё освобождённое внутри L1+L2 остаётся зарезервированным на диске (WSL2/Hyper-V не делает auto-shrink).

```powershell
# 1. Закрыть Docker Desktop (через tray-icon — Quit)
# 2. wsl --shutdown
# 3. Запустить от админа:
Optimize-VHD `
  -Path "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" `
  -Mode Full
```

Альтернатива через `diskpart compact vdisk` если нет Hyper-V модуля.

## Долгосрочные правки (чтобы не наросло)

### F1 — удалить или починить `apps/web/Dockerfile`

CLAUDE.md явно говорит «web запускается на хосте, не в docker». Самое чистое — **удалить файл + service `web` из `docker-compose.yml`**.

Если по причине нужен — переписать на multi-stage:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/types/package.json ./packages/types/
RUN npm ci --workspace=@mushroom-map/web    # точечно, БЕЗ --workspaces
COPY apps/web ./apps/web
COPY packages ./packages
RUN npm run build --workspace=@mushroom-map/web

FROM nginx:alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
```

Финальный размер 30-50 MB.

### F2 — расширить `.dockerignore`

```
# Mobile native build artefacts
apps/mobile/android/build
apps/mobile/android/.gradle
apps/mobile/android/app/build
apps/mobile/ios/build
apps/mobile/ios/Pods
apps/mobile/.expo

# Все dist/build/.gradle, не только корневые
**/dist
**/build
**/.gradle

# Logs (есть `?? logs/` в git status)
logs/

# Cache
.coverage
.pytest_cache
.mypy_cache
.ruff_cache
**/.vite
**/.turbo
```

### F3 — Docker Desktop GUI settings

- Settings → Resources → Advanced → **Disk image size limit:** 40-50 GB.
- Если есть тумблер «**Enable sparse VHD**» (Win11 + Docker Desktop ≥ 4.27) — включить. VHDX будет автосжиматься.

### F4 — еженедельный cleanup-скрипт

`scripts/dev/docker_weekly_cleanup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker builder prune --filter "until=168h" -f
docker image prune --filter "until=168h" -f
docker volume prune -f
echo "Done. Run Optimize-VHD from PowerShell to actually shrink the VHDX."
```

## Прогноз результата

| Этап | Внутри Docker | На C: | Усилие |
|------|---|---|---|
| L1 (prune) | ~32 GB | 0 (VHDX не сжимается) | 30 сек |
| L2 (extra images) | +1.6 GB | 0 | 1 мин |
| L3 (Optimize-VHD) | — | **~85-95 GB** | 5-10 мин |
| F1 (web Dockerfile) | предотвращает регресс | — | 30 мин |
| F2 (.dockerignore) | предотвращает регресс | — | 5 мин |
| F3 (sparse VHDX) | — | автосжатие в будущем | 2 мин |
| F4 (weekly script) | предотвращает накапливание | — | 10 мин |

**Итог:** ~90 GB возвращаются на C:, регрессия закрыта правками F1+F2+F3.

## Разделение ответственности

**Что может сделать Claude (с отмашкой):**
- L1, L2 — все `docker rm` / `docker prune` команды.
- F1 — удалить `apps/web/Dockerfile` + правка `docker-compose.yml`, или переписать на multi-stage.
- F2 — расширить `.dockerignore`.
- F4 — написать `scripts/dev/docker_weekly_cleanup.sh`.

**Что НЕ может Claude (только пользователь):**
- L3 — закрыть Docker Desktop через tray-icon, открыть **админский** PowerShell, запустить `Optimize-VHD`. Требует:
  - GUI-действие (закрытие Docker Desktop через системный tray).
  - PowerShell с правами администратора.
  - Уверенность что в текущий момент ничего критичного не запущено в контейнерах.
- F3 — переключатель в Docker Desktop GUI (Settings → Resources). GUI-only.

## Пошаговая инструкция см. в [docs/superpowers/plans/2026-05-02-docker-disk-cleanup.md](../plans/2026-05-02-docker-disk-cleanup.md)
