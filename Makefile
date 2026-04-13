.PHONY: help up down db-migrate db-migrate-list db-seed db-seed-regions \
        install install-geodata install-api install-web \
        api-dev web-dev \
        ingest-forest ingest-vk extract-places build-tiles \
        lint clean

help:
	@echo "mushroom-map — команды разработки"
	@echo ""
	@echo "  Первый запуск:"
	@echo "    make up               поднять PostGIS (Docker)"
	@echo "    make install          установить Python-зависимости"
	@echo "    make db-migrate       прогнать миграции (001-006)"
	@echo "    make db-seed-regions  загрузить регионы (Ленобласть, СПб)"
	@echo "    make db-seed          загрузить виды грибов"
	@echo ""
	@echo "  Разработка:"
	@echo "    make api-dev          запустить API (uvicorn --reload)"
	@echo "    make web-dev          запустить фронт (vite)"
	@echo "    make db-migrate-list  статус миграций"
	@echo ""
	@echo "  Пайплайны:"
	@echo "    make ingest-forest SOURCE=osm REGION=lenoblast"
	@echo "    make build-tiles REGION=lenoblast"
	@echo "    make ingest-vk REGION=lenoblast"
	@echo "    make extract-places REGION=lenoblast"

# ─── Docker ───────────────────────────────────────────────
up:
	docker compose up -d db

down:
	docker compose down

# ─── Install ──────────────────────────────────────────────
install: install-geodata install-api install-web

install-geodata:
	pip install -e services/geodata

install-api:
	pip install -e services/api
	pip install -e services/species_registry

install-web:
	cd services/web && npm install

# ─── DB ───────────────────────────────────────────────────
db-migrate:
	python db/migrate.py

db-migrate-list:
	python db/migrate.py --list

db-seed-regions:
	psql "$(DATABASE_URL)" -f db/seeds/regions.sql

db-seed:
	PYTHONPATH=services/species_registry/src python -m species_registry.loader \
		--yaml db/seeds/species_registry.yaml

# ─── Services ─────────────────────────────────────────────
api-dev:
	cd services/api && PYTHONPATH=src uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

web-dev:
	cd services/web && npm run dev

# ─── Pipelines (phase 2) ──────────────────────────────────
ingest-forest:
	python pipelines/ingest_forest.py --source $(SOURCE) --region $(REGION)

ingest-vk:
	python pipelines/ingest_vk.py --region $(REGION)

extract-places:
	python pipelines/extract_places.py --region $(REGION)

build-tiles:
	python pipelines/build_tiles.py --region $(REGION)

# ─── Dev ──────────────────────────────────────────────────
lint:
	ruff check services pipelines db

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
