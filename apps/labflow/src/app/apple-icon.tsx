import { ImageResponse } from 'next/og';

// The home-screen icon on iPhones and iPads: the same mark as icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#254ea8' }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <path d="M11 8v15h11" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
