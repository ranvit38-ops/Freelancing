/**
 * Why a lab would pay for this rather than use what is free.
 *
 * Written against what small labs actually use, a shared Drive folder and a
 * document template, with claims that hold today. Free notebook apps are
 * named honestly: they exist, and some labs should use them.
 */
const ROWS: { need: string; free: string; ours: string }[] = [
  {
    need: 'Knowing whose records are thin',
    free: 'A template lists the fields. Finding the blank ones means opening every student’s document.',
    ours: 'Record check lists every started run that is missing something, by student, with what is missing.',
  },
  {
    need: 'Knowing who changed what',
    free: 'Version history exists one document at a time. There is no view of what the whole lab did this week.',
    ours: 'One activity log for the lab: who created, edited or deleted what, filterable by person and downloadable. Deleted notes keep their text.',
  },
  {
    need: 'Bringing in a new student',
    free: 'A folder of files and a list of links in an email.',
    ours: 'Start here: one join link, then an ordered reading path through the lab’s own work.',
  },
  {
    need: 'Repeating a run with one change',
    free: 'Copy last week’s document and hope nobody edits the wrong one.',
    ours: 'Run again copies the plan, links the new run to the old one, and Compare shows exactly what differed.',
  },
  {
    need: 'Finding the raw data later',
    free: 'Somewhere in a folder, under a name only its author understands.',
    ours: 'Each run records where its original data lives, and uploads sit on the run that produced them.',
  },
  {
    need: 'Talking about the work',
    free: 'Chat, tasks and the calendar live in three other apps, away from the records.',
    ours: 'Lab chat, direct messages, tasks with deadlines, and a calendar that shows up in Google Calendar, all beside the records.',
  },
];

export function WhyNotFree() {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Why not a shared Drive folder?</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Most small labs run on a shared folder and a document template, and they are free. They hold the
        writing. They cannot tell the person running the lab what is missing, or who changed what.
      </p>
      <div tabIndex={0} role="region" aria-label="Labquill compared with a shared folder" className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
              <th scope="col" className="px-4 py-3 font-medium">What you need</th>
              <th scope="col" className="px-4 py-3 font-medium">Shared folder and a template</th>
              <th scope="col" className="px-4 py-3 font-medium text-accent">Labquill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {ROWS.map((r) => (
              <tr key={r.need}>
                <th scope="row" className="px-4 py-3 text-left font-medium">{r.need}</th>
                <td className="px-4 py-3 text-muted">{r.free}</td>
                <td className="px-4 py-3">{r.ours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
        Free notebook apps exist too. eLabFTW is free and open source if your department will run a server for
        it, and Benchling and SciNote offer free tiers; check what they include for a whole lab. They are built
        around the person writing the notebook. Labquill is built around the person running the lab: what is
        missing, who did what, and getting new people up to speed, priced per lab rather than per seat.
      </p>
    </div>
  );
}
