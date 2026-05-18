/**
 * SelectControl — compact native-select replacement for the bulky Pills
 * filter (стат «Сезонность»). Same prop shape as Pills so it is a
 * drop-in. Token-styled; Claude Design re-skins later.
 */
import css from "./SeasonCharts.module.css";

export function SelectControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <label className={css.selectWrap}>
      {label && <span className={css.selectLabel}>{label}</span>}
      <select
        className={css.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
