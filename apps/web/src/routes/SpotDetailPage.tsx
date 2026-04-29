/**
 * /spots/:id — детальная страница одного спота.
 *
 * Минималистичный template (по spec'у redesign-2026-04 секция «/spots/:id»):
 *  - Заголовок + цветовой маркер
 *  - Заметка
 *  - Mono-табличка с координатами и датами
 *  - CTA «Открыть на карте» (chanterelle)
 *  - Inline-редактор (имя/заметка/цвет — но не lat/lon, для координат
 *    надо удалить+создать)
 *  - Удаление с подтверждением
 *
 * Auth-gated через ProtectedRoute. Если spot не принадлежит юзеру —
 * /api/cabinet/spots не вернёт его в listSpots; страница покажет
 * «не найдено».
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteSpot,
  listSpots,
  patchSpot,
} from "@mushroom-map/api-client";
import type { SpotRating, UserSpot } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/useAuth";
import { RATING_OPTIONS, RATING_HEX, RATING_LABEL } from "../lib/spotRating";
import {
  TREE_TAGS,
  MUSHROOM_TAGS,
  BERRY_TAGS,
  tagLabel,
  type SpotTag,
} from "../lib/spotTags";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./SpotDetailPage.module.css";
import prose from "./Prose.module.css";

export function SpotDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [spot, setSpot] = useState<UserSpot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">(
    "loading",
  );
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // edit-form state — заполняется при включении edit-режима
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<SpotRating>(3);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (slug: string) => {
    setTags((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };

  usePageTitle(
    spot ? `${spot.name} — Geobiom` : "Место — Geobiom",
    spot?.note || "Сохранённое место в Geobiom.",
  );

  useEffect(() => {
    let cancelled = false;
    const tok = getAccessToken();
    if (!tok) {
      setState("error");
      return;
    }
    setState("loading");
    listSpots(tok)
      .then((all) => {
        if (cancelled) return;
        const found = all.find((s) => s.id === id) ?? null;
        if (!found) {
          setState("not_found");
        } else {
          setSpot(found);
          setName(found.name);
          setNote(found.note);
          setRating(found.rating);
          setTags(found.tags ?? []);
          setState("ready");
        }
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [id, getAccessToken]);

  if (state === "loading") {
    return (
      <Container as="article" size="narrow">
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>Загрузка…</p>
      </Container>
    );
  }

  if (state === "not_found") {
    return (
      <Container as="article" size="narrow">
        <h1 className={prose.h1}>Место не найдено</h1>
        <p className={prose.lead}>
          Возможно, оно было удалено или принадлежит другому аккаунту.
        </p>
        <p className={prose.p}>
          <Link to="/spots">← Вернуться ко всем местам</Link>
        </p>
      </Container>
    );
  }

  if (state === "error" || !spot) {
    return (
      <Container as="article" size="narrow">
        <h1 className={prose.h1}>Ошибка загрузки</h1>
        <p className={prose.p}>
          Попробуйте обновить страницу.{" "}
          <Link to="/spots">Назад ко всем местам</Link>.
        </p>
      </Container>
    );
  }

  const ratingHex = RATING_HEX[spot.rating] ?? RATING_HEX[3];
  const ratingLabel = RATING_LABEL[spot.rating] ?? String(spot.rating);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const tok = getAccessToken();
    if (!tok) return;
    setSubmitting(true);
    try {
      const updated = await patchSpot(tok, spot.id, {
        name: name.trim(),
        note: note.trim(),
        rating,
        tags,
      });
      setSpot(updated);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Удалить это место? Это нельзя отменить.")) return;
    const tok = getAccessToken();
    if (!tok) return;
    try {
      await deleteSpot(tok, spot.id);
      navigate("/spots");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Container as="article" size="narrow">
      <nav className={styles.breadcrumb} aria-label="Хлебные крошки">
        <Link to="/spots">← все места</Link>
      </nav>

      <header className={styles.header}>
        <span
          className={styles.markerDot}
          style={{ background: ratingHex }}
          aria-label={`Оценка ${spot.rating} (${ratingLabel})`}
          title={`${spot.rating} — ${ratingLabel}`}
        />
        <h1 className={styles.title}>{spot.name}</h1>
      </header>

      {spot.note ? <p className={styles.note}>{spot.note}</p> : null}

      {spot.tags && spot.tags.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 var(--space-4)" }}>
          {spot.tags.map((slug) => (
            <span
              key={slug}
              style={{
                padding: "2px 10px",
                border: "1px solid var(--rule)",
                borderRadius: 999,
                fontSize: "var(--fs-sm)",
                color: "var(--ink-dim)",
                background: "var(--paper-rise)",
              }}
            >
              {tagLabel(slug)}
            </span>
          ))}
        </div>
      ) : null}

      <dl className={styles.facts}>
        <dt>координаты</dt>
        <dd>
          <Link
            to={`/?lat=${spot.lat.toFixed(5)}&lon=${spot.lon.toFixed(5)}&z=14`}
            className={styles.coordLink}
            title="Открыть на карте"
          >
            {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}
          </Link>
        </dd>

        <dt>оценка</dt>
        <dd>{spot.rating} — {ratingLabel}</dd>

        <dt>создан</dt>
        <dd>{new Date(spot.created_at).toLocaleDateString("ru-RU")}</dd>

        {spot.updated_at !== spot.created_at ? (
          <>
            <dt>изменён</dt>
            <dd>{new Date(spot.updated_at).toLocaleDateString("ru-RU")}</dd>
          </>
        ) : null}
      </dl>

      <div className={styles.ctaRow}>
        <Link
          to={`/?lat=${spot.lat.toFixed(5)}&lon=${spot.lon.toFixed(5)}&z=14`}
          className={styles.cta}
        >
          Открыть на карте →
        </Link>
        {!editing ? (
          <Button
            variant="ghost"
            onClick={() => {
              setName(spot.name);
              setNote(spot.note);
              setRating(spot.rating);
              setTags(spot.tags ?? []);
              setEditing(true);
            }}
          >
            Изменить
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => void handleDelete()}
          className={styles.deleteBtn}
        >
          Удалить
        </button>
      </div>

      {editing ? (
        <Card>
          <form onSubmit={handleSave} className={styles.form}>
            <label className={styles.field}>
              <span>Название</span>
              <input
                type="text"
                value={name}
                required
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Заметка</span>
              <textarea
                value={note}
                maxLength={4000}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <fieldset className={styles.colorRow}>
              <legend className={styles.colorLegend}>Оценка (1=плохое, 5=отличное)</legend>
              {RATING_OPTIONS.map((r) => (
                <label key={r.value} className={styles.colorOpt}>
                  <input
                    type="radio"
                    name="rating"
                    value={r.value}
                    checked={rating === r.value}
                    onChange={() => setRating(r.value)}
                  />
                  <span className={styles.colorDot} style={{ background: r.hex }} />
                  <span>{r.value} · {r.label}</span>
                </label>
              ))}
            </fieldset>

            <EditTagBlock title="Деревья" options={TREE_TAGS} selected={tags} onToggle={toggleTag} />
            <EditTagBlock title="Грибы"   options={MUSHROOM_TAGS} selected={tags} onToggle={toggleTag} />
            <EditTagBlock title="Ягоды"   options={BERRY_TAGS} selected={tags} onToggle={toggleTag} />

            <div className={styles.formActions}>
              <Button type="submit" disabled={submitting || name.trim().length === 0}>
                {submitting ? "Сохраняем…" : "Сохранить"}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {error ? (
        <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}
    </Container>
  );
}

function EditTagBlock({ title, options, selected, onToggle }: {
  title: string;
  options: SpotTag[];
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend style={{ fontSize: "var(--fs-sm)", color: "var(--ink-dim)", marginBottom: "var(--space-1)" }}>
        {title}
      </legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((t) => {
          const on = selected.includes(t.slug);
          return (
            <button
              key={t.slug}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(t.slug)}
              style={{
                padding: "4px 10px",
                border: `1px solid ${on ? "var(--forest)" : "var(--rule)"}`,
                background: on ? "var(--forest)" : "var(--paper)",
                color: on ? "#fff" : "var(--ink)",
                borderRadius: 999,
                fontSize: "var(--fs-sm)",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
                lineHeight: 1.3,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
