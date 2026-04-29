/**
 * Модалка «Сохранить место» — открывается из MapPage когда юзер
 * жмёт «Сохранить это место» в попапе карты. Если юзер не залогинен,
 * MapPage редиректит на /auth?next=…/map вместо открытия модалки.
 *
 * Простой реактовский диалог поверх карты — без портала, без focus
 * trap'а; для one-shot формы достаточно.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createSpot } from "@mushroom-map/api-client";
import type { SpotColor } from "@mushroom-map/types";
import { useAuth } from "../auth/useAuth";
import { SPOT_COLOR_OPTIONS } from "../lib/spotColors";
import { TREE_TAGS, MUSHROOM_TAGS, BERRY_TAGS, type SpotTag } from "../lib/spotTags";


interface Props {
  lat: number;
  lon: number;
  onClose: () => void;
  /** Вызывается после успешного create — даёт MapPage шанс рефрешнуть
   *  spots-слой на карте. Опционально. */
  onSaved?: () => void;
}


export function SaveSpotModal({ lat, lon, onClose, onSaved }: Props) {
  const { getAccessToken } = useAuth();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState<SpotColor>("forest");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (slug: string) => {
    setTags((cur) =>
      cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    );
  };
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc закрывает.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const tok = getAccessToken();
    if (!tok) return;
    setSubmitting(true);
    try {
      await createSpot(tok, {
        name: name.trim(),
        note: note.trim(),
        color,
        tags,
        lat,
        lon,
      });
      setDone(true);
      setError(null);
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Сохранить место"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,20,20,0.4)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: "var(--space-3)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background:    "var(--paper-rise)",
          color:         "var(--ink)",
          border:        "1px solid var(--rule)",
          borderRadius:  10,
          padding:       "var(--space-5)",
          width:         "min(420px, 100%)",
          maxHeight:     "90vh",
          overflowY:     "auto",
          boxShadow:     "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "var(--space-3)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fs-h3)" }}>
            {done ? "Сохранено" : "Сохранить место"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: "transparent",
              border:     "none",
              fontSize:   "1.4rem",
              lineHeight: 1,
              cursor:     "pointer",
              color:      "var(--ink-faint)",
              padding:    0,
              width:      28,
              height:     28,
            }}
          >
            ×
          </button>
        </div>

        {done ? (
          <>
            <p style={{ marginTop: 0, color: "var(--ink-dim)", fontSize: "var(--fs-sm)" }}>
              Точка добавлена в ваш кабинет. Координаты:{" "}
              <code>{lat.toFixed(5)}, {lon.toFixed(5)}</code>
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
              <button
                type="button"
                onClick={onClose}
                style={modalBtnStyle("ghost")}
              >
                Закрыть
              </button>
              <Link
                to="/spots"
                style={{ ...modalBtnStyle("primary"), textDecoration: "none" }}
              >
                Все места
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-3)" }}>
            <label style={fieldLabel}>
              <span>Название</span>
              <input
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Поляна за Лемболово"
                style={inputStyle}
                autoFocus
              />
            </label>

            <label style={fieldLabel}>
              <span>Заметка</span>
              <textarea
                value={note}
                maxLength={4000}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Что нашли / что вспомнить позже"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-body)" }}
              />
            </label>

            <fieldset style={fieldsetStyle}>
              <legend style={legendStyle}>Цвет маркера</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))", gap: "var(--space-2)" }}>
                {SPOT_COLOR_OPTIONS.map((c) => {
                  const isSelected = color === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      aria-pressed={isSelected}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        padding: "var(--space-2)",
                        background: isSelected ? "var(--paper-rise)" : "var(--paper)",
                        border: isSelected ? "2px solid var(--ink)" : "1px solid var(--rule)",
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        transition: "border-color 120ms ease, background 120ms ease",
                        fontFamily: "var(--font-body)",
                        fontSize: "var(--fs-xs)",
                        color: "var(--ink)",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: c.cssVar,
                          border: "1px solid rgba(0,0,0,0.15)",
                        }}
                        aria-hidden
                      />
                      <span style={{ fontSize: 11 }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <TagBlock title="Деревья" options={TREE_TAGS} selected={tags} onToggle={toggleTag} />
            <TagBlock title="Грибы"   options={MUSHROOM_TAGS} selected={tags} onToggle={toggleTag} />
            <TagBlock title="Ягоды"   options={BERRY_TAGS} selected={tags} onToggle={toggleTag} />

            <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-faint)", margin: 0, fontFamily: "var(--font-mono)" }}>
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>

            {error && (
              <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", margin: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
              <button type="button" onClick={onClose} style={modalBtnStyle("ghost")}>
                Отмена
              </button>
              <button
                type="submit"
                disabled={submitting || name.trim().length === 0}
                style={modalBtnStyle("primary")}
              >
                {submitting ? "Сохраняем…" : "Сохранить"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


// Tag-picker блок: чипы с checkbox-семантикой. Multi-select без verbose UI.
function TagBlock({ title, options, selected, onToggle }: {
  title: string;
  options: SpotTag[];
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>{title}</legend>
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

// Inline styles — для one-shot модалки нет смысла заводить отдельный CSS-modul.

const fieldsetStyle: React.CSSProperties = {
  border: "none",
  padding: 0,
  margin: 0,
};
const legendStyle: React.CSSProperties = {
  fontSize: "var(--fs-sm)",
  color: "var(--ink-dim)",
  marginBottom: "var(--space-1)",
  padding: 0,
};

const fieldLabel: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-1)",
  fontSize: "var(--fs-sm)",
};

const inputStyle: React.CSSProperties = {
  font: "inherit",
  fontFamily: "var(--font-body)",
  padding: "var(--space-2) var(--space-3)",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  background: "var(--paper)",
  color: "var(--ink)",
};

function modalBtnStyle(variant: "primary" | "ghost"): React.CSSProperties {
  if (variant === "primary") {
    return {
      padding: "var(--space-2) var(--space-4)",
      background: "var(--forest)",
      color: "#fff",
      border: "1px solid var(--forest)",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: "var(--fs-sm)",
      fontWeight: 500,
      fontFamily: "var(--font-body)",
    };
  }
  return {
    padding: "var(--space-2) var(--space-4)",
    background: "transparent",
    color: "var(--ink-dim)",
    border: "1px solid var(--rule)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "var(--fs-sm)",
    fontFamily: "var(--font-body)",
  };
}
