/**
 * Shown the instant a link is clicked, while the next page is still being
 * rendered on the server.
 *
 * Every page in this group is server-rendered per request, so a click is a
 * round trip. On a laptop next to the database that is under a tenth of a
 * second and invisible. Over the internet to a hosted instance, with a cold
 * container or a slow query, it is closer to a second — and with nothing on
 * screen changing, that second reads as "the click did not work", so people
 * click again.
 *
 * A skeleton rather than a spinner: it occupies the shape the real page will
 * take, so the layout does not jump when the content lands.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* Screen readers get the announcement; the bars are decoration. */}
      <span className="sr-only" role="status" aria-live="polite">
        Loading
      </span>

      <div className="mb-8">
        <div className="h-3 w-24 rounded bg-raised" />
        <div className="mt-3 h-7 w-64 max-w-full rounded bg-raised" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-raised" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <div className="h-4 w-40 rounded bg-raised" />
            </div>
            <div className="divide-y divide-line">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="px-5 py-4">
                  <div className="h-4 w-2/3 rounded bg-raised" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-raised" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <div className="h-4 w-28 rounded bg-raised" />
          </div>
          <div className="space-y-3 px-5 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-full rounded bg-raised" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
