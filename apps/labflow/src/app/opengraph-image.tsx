import { ImageResponse } from 'next/og';

// The card shown when a Labquill link is shared. Colours are written out
// because an image has no access to the site's CSS variables; they match the
// light theme's tokens in globals.css.
export const alt = 'Labquill: know what your lab recorded, and what it left out';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const rows: [string, number, string][] = [
  ['Maya Chen', 0, 'Today'],
  ['Diego Alvarez', 2, 'Yesterday'],
  ['Priya Nair', 0, 'Tue'],
  ['Tom Okafor', 1, '12 days ago'],
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#fafafb', padding: 72, color: '#111827' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, fontWeight: 600 }}>
            <svg width="44" height="44" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="7" fill="#254ea8" />
              <path d="M11 8v15h11" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Labquill
          </div>
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1 }}>
            Know what your lab recorded, and what it left out.
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#5b6474' }}>For university research labs. Priced per lab.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56, marginTop: 70, width: 440, alignSelf: 'flex-start', background: '#fff', border: '1px solid #e2e5eb', borderRadius: 16, fontSize: 22 }}>
          <div style={{ display: 'flex', padding: '20px 24px', borderBottom: '1px solid #e2e5eb', fontWeight: 600 }}>Your lab this week</div>
          {rows.map(([name, thin, last], i) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 24px', borderBottom: i < rows.length - 1 ? '1px solid #e2e5eb' : 'none' }}>
              <span>{name}</span>
              <span style={{ color: thin ? '#805406' : '#68707e' }}>{thin ? `${thin} to fill in` : last}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
