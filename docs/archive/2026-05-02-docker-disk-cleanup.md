# Docker cleanup — пошаговая инструкция (что от тебя, что от меня)

Дата: 2026-05-02
Спека: [`docs/superpowers/specs/2026-05-02-docker-disk-cleanup.md`](../specs/2026-05-02-docker-disk-cleanup.md)

Задача: вернуть на C: ~90 GB. Сейчас VHDX 130 GB, реально нужно ~10 GB.

Ниже — последовательность шагов в порядке исполнения. Перед каждым блоком чётко помечено: **🤖 Я делаю** / **👤 Ты делаешь**.

---

## Шаг 0. Проверка перед стартом

**👤 Ты:**
- Убедись что ничего важного не запущено в контейнерах. Сейчас живых два:
  - `mushroom_db` — Postgres с твоей dev-БД (5.78 GB pgdata, **трогать не буду**).
  - `mushroom_api` — FastAPI dev. Если уronaltом — вообще наплевать, поднимется обратно.
- Если делаешь что-то прямо сейчас (миграция, ingest VK, build_tiles) — закончи или сохрани прогресс. После cleanup'а dev-стек придётся пере-`docker compose up`.

Когда готов — напиши «**погнали L1**».

---

## Шаг 1. Чистка внутри Docker (L1 + L2)

**🤖 Я:** запускаю последовательность команд:

```bash
docker rm mushroom_web                     # снести мёртвый контейнер
docker image rm mushroom-map-web:latest    # снести мёртвый 29.6 GB образ
docker volume prune -f                     # 6 orphan-volumes
docker image rm ubuntu:24.04 ubuntu:22.04  # неиспользуемые base
docker builder prune --all -f              # build cache
docker system prune -f                     # хвост dangling
```

И опционально (по твоему слову):

```bash
docker image rm klokantech/tippecanoe:latest    # 766 MB, 8 лет, redownload by need
docker image rm protomaps/go-pmtiles:latest     # 81 MB, redownload by need
```

После этого покажу `docker system df` — итоговое состояние.

**Эффект:** ~32 GB освобождены ВНУТРИ Docker, но VHDX на C: всё ещё 130 GB. Это нормально — VHDX сжимается отдельно, в шаге 3.

**Время:** 30-60 секунд.

---

## Шаг 2. Кодовые правки чтобы не наросло заново

**🤖 Я** (отдельным PR'ом, после твоего «погнали F1-F2»):

1. **Удалить `apps/web/Dockerfile`** + service `web` из `docker-compose.yml` + service `web` из `docker-compose.prod.yml` (он там и так в комментах помечен как «не входит, фронт на Caddy»).
   - Альтернатива (если по какой-то причине нужен dev-Docker для веба): переписать на multi-stage с `nginx:alpine` финальным слоем.
2. **Расширить `.dockerignore`** — добавить `apps/mobile/android/build`, `**/.gradle`, `**/dist`, `**/build`, `logs/`, `**/.vite`, `**/.turbo`, `.pytest_cache` и т.д.
3. **Создать `scripts/dev/docker_weekly_cleanup.sh`** — скрипт для запуска раз в неделю, делает то же что L1 но щадящее (только старше 7 дней).

Время: ~30-40 минут моей работы.

---

## Шаг 3. Сжатие VHDX на диске (только ты, нужны админские права)

После того как шаги 1-2 готовы:

**👤 Ты:**

### 3.1. Закрой Docker Desktop

- Найди иконку кита Docker в **system tray** (правый нижний угол, рядом с часами; возможно, в развороте «^»).
- Правый клик → **Quit Docker Desktop**.
- Подожди пока иконка кита исчезнет (5-10 секунд).

### 3.2. Закрой WSL

Открой **обычный PowerShell** (не админский, можно из Win+R → `pwsh`):

```powershell
wsl --shutdown
```

Это завершит все WSL дистрибутивы. **Если у тебя что-то открыто в WSL-терминалах (например, в этом самом claude), они закроются.** Это нормально.

### 3.3. Запусти Optimize-VHD из админского PowerShell

Win+X → **Windows PowerShell (Admin)** или **Terminal (Admin)** → нажми **Yes** в UAC.

Вставь:

```powershell
Optimize-VHD `
  -Path "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" `
  -Mode Full
```

Команда выполнится 5-10 минут. На выходе ничего не печатает, просто возвращает приглашение. Размер VHDX упадёт до фактических ~8-12 GB.

**Проверка результата:**

```powershell
Get-Item "$env:LOCALAPPDATA\Docker\wsl\disk\docker_data.vhdx" |
  Select-Object FullName, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}
```

Должно показать ~8-12 GB вместо 130.

### 3.4. Если Optimize-VHD не работает

Если получишь `Optimize-VHD : The term ... is not recognized`, значит Hyper-V модуль не установлен. Один раз поставь его (тоже из админского PowerShell):

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-Management-PowerShell
```

После этого нужен ребут компа. Затем повторить 3.3.

**Альтернатива без Hyper-V модуля** — `diskpart` (тоже из админского PowerShell):

```
diskpart
> select vdisk file="C:\Users\ikoch\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
> attach vdisk readonly
> compact vdisk
> detach vdisk
> exit
```

### 3.5. Запусти Docker Desktop обратно

Из меню Пуск или иконки на рабочем столе → Docker Desktop. Подожди пока кит в трее перестанет анимироваться (1-2 минуты).

После этого — `docker compose up -d db api` (или что обычно используешь) поднимает живой стек заново. **`mushroom_db` сохранил pgdata** (volume не трогали), все данные на месте.

---

## Шаг 4. (Опционально) GUI-настройки в Docker Desktop

**👤 Ты, в Docker Desktop GUI:**

1. Открой Docker Desktop → шестерёнка вверху справа → **Resources** → **Advanced**.
2. **Disk image size limit:** поставь 40 GB (сейчас вероятно стоит 1024 GB).
3. Если в этой же секции есть переключатель **Enable sparse VHD** или **VHDX file optimisation** — **включи**. На Windows 11 + Docker Desktop 4.27+ это есть, и тогда VHDX будет сам уменьшаться при удалении контейнеров (не понадобится Optimize-VHD руками).
4. **Apply & Restart**.

Это одноразовая настройка. После этого шаги 3.1-3.3 в будущем не понадобятся — sparse VHDX делает компакт сам.

---

## Шаг 5. Закрытие итерации

**🤖 Я** (после успеха шагов 1-4):

1. Удалить memory `project_disk_cleanup_pending.md` (теперь решено).
2. Обновить `MEMORY.md` индекс.
3. Закоммитить .dockerignore + удалённый Dockerfile + cleanup-скрипт. Push в origin.
4. Проверить `gh run list` — деплой ничего не должен запускаться (правки только dev-side).

---

## Сводная таблица «кто что»

| Шаг | Кто | Действие | Время |
|-----|-----|----------|-------|
| 0 | 👤 | Скажи «погнали L1» когда готов | 1 мин |
| 1 | 🤖 | docker rm/prune команды | 1 мин |
| 2 | 🤖 | PR с .dockerignore + удалением web Dockerfile + weekly cleanup скрипт | 30 мин |
| 3.1 | 👤 | Quit Docker Desktop из tray | 30 сек |
| 3.2 | 👤 | `wsl --shutdown` в обычном PowerShell | 10 сек |
| 3.3 | 👤 | `Optimize-VHD ...` в **админском** PowerShell | 5-10 мин |
| 3.5 | 👤 | Запустить Docker Desktop | 2 мин |
| 4 | 👤 | Settings → Resources → Disk size limit + Sparse VHD | 2 мин |
| 5 | 🤖 | Memory cleanup + commit + push | 5 мин |

**Чисто твоего времени: ~10-15 минут активных действий, плюс ожидание Optimize-VHD.**

## Если что-то пошло не так

- **Шаг 1 — `docker volume prune` спросил подтверждения:** ответь `y`. Список выводимых volume имён должен совпадать с теми 6, что в спеке (UUID-имена без LINKS).
- **Шаг 3.3 — Optimize-VHD говорит "файл занят":** значит Docker Desktop / WSL не до конца закрыты. Повтори 3.1 + 3.2, проверь Task Manager на остаточные `vmmem`, `wsl.exe`, `Docker Desktop.exe`.
- **Шаг 3.5 — Docker Desktop ругается на VHDX:** в крайнем случае Settings → Troubleshoot → **Reset to factory defaults** воссоздаст пустой VHDX. **Это потеряет pgdata** — если шёл по этому плану, perfdata был сохранён в volume `mushroom-map_pgdata` внутри VHDX, и при reset он умрёт. Поэтому: **до factory reset — `docker exec mushroom_db pg_dump -U mushroom mushroom_map > backup.sql`**.

## Безопасность данных

- `mushroom-map_pgdata` (5.78 GB) — единственная вещь которую **категорически нельзя терять** в этом cleanup'е. Все шаги выше эту volume не трогают.
- Если хочешь страховку перед шагом 3 — скажи «сделай дамп БД сначала», я выполню `pg_dump` в `data/backups/` локально перед прочим cleanup'ом.
