/**
 * /spots — список сохранённых юзером мест с CRUD'ом. Раньше жил на
 * /cabinet/spots; redesign-2026-04 переехал в верхний нав-уровень
 * («Споты» — один из четырёх IA-разделов). /cabinet/spots остался
 * 301'ом, см. router.tsx.
 *
 * Создание места: форма с name + note + color + lat/lon. Lat/lon можно
 * вписать руками или нажать «Использовать моё положение» — браузерный
 * `navigator.geolocation.getCurrentPosition`. Карта-клик-добавить —
 * следующий шаг (требует MapView surgery, не делаем сейчас).
 */

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createSpot,
  deleteSpot,
  listSpots,
} from "@mushroom-map/api-client";
import type { SpotColor, UserSpot } from "@mushroom-map/types";
import { Container } from "../components/layout/Container";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/useAuth";
import { SPOT_COLOR_OPTIONS } from "../lib/spotColors";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./CabinetSpotsPage.module.css";
import prose from "./Prose.module.css";


export function CabinetSpotsPage() {
  usePageTitle(
    "Споты — Geobiom",
    "Приватный список грибных мест. Видишь только ты, ничего не публикуется.",
  );

  const { user, getAccessToken } = useAuth();
  const [spots, setSpots] = useState<UserSpot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Состояние формы.
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState<SpotColor>("forest");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const tok = getAccessToken();
    if (!tok) return;
    try {
      const data = await listSpots(tok);
      setSpots(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null; // ProtectedRoute уже отфильтровал.

  const handleGeolocate = () => {
    if (!("geolocation" in navigator)) {
      setError("Браузер не поддерживает определение местоположения");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLon(pos.coords.longitude.toFixed(5));
      },
      (err) => setError(`Не удалось определить положение: ${err.message}`),
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const tok = getAccessToken();
    if (!tok) return;
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      setError("Введите координаты числами (десятичные градусы)");
      return;
    }
    setSubmitting(true);
    try {
      await createSpot(tok, {
        name: name.trim(),
        note: note.trim(),
        color,
        lat: latNum,
        lon: lonNum,
      });
      setName("");
      setNote("");
      setLat("");
      setLon("");
      setError(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const tok = getAccessToken();
    if (!tok) return;
    if (!confirm("Удалить это место?")) return;
    try {
      await deleteSpot(tok, id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Container as="article" size="default">
      <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
        <Link to="/cabinet">Кабинет</Link>
        <span aria-hidden="true">/</span>
        <span>Споты</span>
      </nav>

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--moss)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Мои споты
      </p>
      <h1 className={prose.h1}>
        {spots && spots.length > 0
          ? `${spots.length} сохранённых мест`
          : "Сохранённые места"}
      </h1>
      <p className={prose.lead}>
        Видишь только ты. Никаких агрегаций, ничего не публикуется.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span>Название</span>
            <input
              type="text"
              value={name}
              required
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Поляна за Лемболово"
            />
          </label>

          <label className={styles.field}>
            <span>Заметка</span>
            <textarea
              value={note}
              maxLength={4000}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Белые в августе, у поваленной берёзы"
            />
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Широта</span>
              <input
                type="text"
                inputMode="decimal"
                value={lat}
                required
                onChange={(e) => setLat(e.target.value)}
                placeholder="60.31"
              />
            </label>
            <label className={styles.field}>
              <span>Долгота</span>
              <input
                type="text"
                inputMode="decimal"
                value={lon}
                required
                onChange={(e) => setLon(e.target.value)}
                placeholder="30.21"
              />
            </label>
            <button type="button" onClick={handleGeolocate} className={styles.geoBtn}>
              Моё положение
            </button>
          </div>

          <fieldset className={styles.colorRow}>
            <legend className={styles.colorLegend}>Маркер</legend>
            {SPOT_COLOR_OPTIONS.map((c) => (
              <label key={c.value} className={styles.colorOpt}>
                <input
                  type="radio"
                  name="color"
                  value={c.value}
                  checked={color === c.value}
                  onChange={() => setColor(c.value)}
                />
                <span className={styles.colorDot} style={{ background: c.cssVar }} />
                <span>{c.label}</span>
              </label>
            ))}
          </fieldset>

          <Button type="submit" disabled={submitting || name.trim().length === 0}>
            {submitting ? "Сохраняем…" : "Добавить"}
          </Button>
        </form>
      </Card>

      {error && (
        <p className={prose.p} style={{ color: "var(--danger)" }}>{error}</p>
      )}

      {spots === null && !error && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>Загрузка…</p>
      )}

      {spots && spots.length === 0 && (
        <p className={prose.p} style={{ color: "var(--ink-dim)" }}>
          Пока пусто. Добавьте первое место сверху.
        </p>
      )}

      {spots && spots.length > 0 && (
        <ul className={styles.list}>
          {spots.map((s) => {
            const colorCss = SPOT_COLOR_OPTIONS.find((c) => c.value === s.color)?.cssVar ?? "var(--forest)";
            return (
              <li key={s.id} className={styles.row}>
                <span className={styles.markerDot} style={{ background: colorCss }} aria-hidden="true" />
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>
                    <Link to={`/spots/${s.id}`} className={styles.rowTitleLink}>
                      {s.name}
                    </Link>
                  </div>
                  {s.note && <div className={styles.rowNote}>{s.note}</div>}
                  <div className={styles.rowMeta}>
                    <Link
                      to={`/?lat=${s.lat}&lon=${s.lon}&z=14`}
                      title="Открыть на карте"
                    >
                      {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
                    </Link>
                    {" · "}
                    <span>{new Date(s.created_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => void handleDelete(s.id)}
                  aria-label="Удалить"
                  title="Удалить"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
