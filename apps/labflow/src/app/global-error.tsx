'use client';

/**
 * The last resort, when even the page frame fails to render.
 *
 * It replaces the root layout, so it cannot rely on the app's stylesheet
 * having loaded; the few styles it needs are inline, and it adapts to a dark
 * system theme on its own.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: 'Canvas',
          color: 'CanvasText',
          colorScheme: 'light dark',
          padding: '0 16px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Labvia didn&rsquo;t load</h1>
          <p style={{ opacity: 0.7, fontSize: 14, lineHeight: 1.5 }}>
            Nothing you saved has been lost. If the site had been idle it may be waking up, which
            takes up to a minute. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              height: 36,
              padding: '0 16px',
              borderRadius: 8,
              border: 0,
              background: '#254EA8',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
