# Архив

Завершённые plans/specs и снапшоты планирования, чья работа уже в коде/проде.
Оставлены для исторического референса; на актуальное состояние не опираются.

| Файл | Что описывает | Статус |
|---|---|---|
| `2026-04-29-mapview-decomposition*.md` | Refactor MapView → registry-driven | shipped 2026-04-29, см. `apps/web/src/components/MapView.tsx` |
| `2026-04-30-oracle-tspu-mitigation.md` | Решение TSPU-блокировки CF/foreign-IP | shipped — two-stack TimeWeb+Oracle live (см. CLAUDE.md) |
| `2026-04-30-prod-readiness-phase0.md` | Backup + UptimeRobot + Tailscale | shipped, runbook → `scripts/backup/README.md` |
| `2026-04-30-prod-readiness-observability.md` | GlitchTip + Umami | shipped, runbook → `services/observability/README.md` |
| `2026-04-30-prod-readiness-oracle-migration.md` | План переезда на Oracle ARM | superseded — пришли к two-stack |
| `2026-05-02-docker-disk-cleanup*.md` | Docker VHDX cleanup 130→12 GB | executed 2026-05-02 |
| `2026-05-02-global-review-design.md` / `*-fixes.md` | Security/quality review (rate-limit, /docs hidden, escapeHtml) | shipped 2026-05-02 |
| `website_plan-2026-04.md` | Pre-launch план geobiom.ru | shipped 2026-04 |
| `roadmap_content_ideas-2026-04.md` | Снапшот roadmap'а до запуска two-stack | superseded by CLAUDE.md + git log |
