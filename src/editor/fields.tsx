import type { ReactNode } from 'react';

const IN = 0.0254;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Length input shown in inches, stored in meters. */
export function NumIn({ label, value, onChange, step = 0.25 }: { label: string; value: number; onChange: (m: number) => void; step?: number }) {
  return (
    <Field label={`${label} (in)`}>
      <input type="number" step={step} value={r2(value / IN)} onChange={(e) => onChange(Number(e.target.value) * IN)} />
    </Field>
  );
}

/** Plain number input. */
export function NumM({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input type="number" step={step} value={Math.round(value * 10000) / 10000} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

/** Three-component vector. Lengths are shown in inches unless unit = 'deg'. */
export function Vec3In({
  label,
  value,
  onChange,
  unit = 'in',
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  unit?: 'in' | 'deg';
}) {
  const k = unit === 'in' ? IN : 1;
  return (
    <Field label={`${label} (${unit === 'in' ? 'in' : '°'})`}>
      <div className="vec">
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            type="number"
            step={unit === 'in' ? 0.25 : 5}
            title={['X (forward)', 'Y (up)', 'Z (right)'][i]}
            value={r2(value[i] / k)}
            onChange={(e) => {
              const n = [...value] as [number, number, number];
              n[i] = Number(e.target.value) * k;
              onChange(n);
            }}
          />
        ))}
      </div>
    </Field>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  const seen = new Set<string>();
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options
          .filter(([v]) => (seen.has(v) ? false : (seen.add(v), true)))
          .map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
      </select>
    </Field>
  );
}
