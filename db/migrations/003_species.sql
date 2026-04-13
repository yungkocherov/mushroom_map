-- Справочник видов грибов и их связь с типами леса.
-- Таблица "species" — стабильный реестр.
-- Таблица "species_forest_affinity" — теоретическая связь вид ↔ тип леса.

CREATE TABLE IF NOT EXISTS species (
    id           SERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,              -- 'boletus-edulis'
    name_ru      TEXT NOT NULL,                     -- 'Белый гриб'
    name_lat     TEXT,                              -- 'Boletus edulis'
    synonyms     TEXT[] NOT NULL DEFAULT '{}',      -- народные названия: 'боровик', 'коровка'
    genus        TEXT,                              -- 'Boletus'
    family       TEXT,                              -- 'Boletaceae'
    edibility    TEXT NOT NULL DEFAULT 'edible'     -- 'edible' | 'conditionally_edible' | 'inedible' | 'toxic' | 'deadly'
                 CHECK (edibility IN ('edible','conditionally_edible','inedible','toxic','deadly')),
    -- сезон активности: месяцы 1..12
    season_months INTEGER[] NOT NULL DEFAULT '{}',
    -- короткое описание + URL фото + источник
    description  TEXT,
    photo_url    TEXT,
    wiki_url     TEXT,
    red_book     BOOLEAN NOT NULL DEFAULT FALSE,
    meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_species_name_ru ON species USING GIN (name_ru gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_species_synonyms ON species USING GIN (synonyms);

-- Теоретическая связь "вид → тип леса".
-- affinity — вес 0..1, насколько вид характерен для этого типа леса.
-- Типы леса кодируются стабильными slug'ами (см. docs/architecture.md).
CREATE TABLE IF NOT EXISTS species_forest_affinity (
    species_id   INTEGER NOT NULL REFERENCES species(id) ON DELETE CASCADE,
    forest_type  TEXT NOT NULL,                    -- 'pine', 'spruce', 'birch', 'oak', 'mixed_coniferous', ...
    affinity     REAL NOT NULL CHECK (affinity BETWEEN 0 AND 1),
    note         TEXT,
    PRIMARY KEY (species_id, forest_type)
);

CREATE INDEX IF NOT EXISTS idx_sfa_forest_type ON species_forest_affinity (forest_type);
