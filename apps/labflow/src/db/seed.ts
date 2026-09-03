/**
 * Realistic but entirely fictional demo data.
 *
 * Every value here is invented for development and demos. Do not seed a
 * deployment that holds real laboratory records.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from './index';
import {
  experimentConditions,
  experimentNotes,
  experimentResults,
  experimentSamples,
  experiments,
  projects,
  protocolVersions,
  protocols,
  samples,
  users,
  workspaceMembers,
  workspaces,
} from './schema';
import { hashPassword } from '@/lib/password';

const DEMO_EMAIL = 'demo@labflow.test';
const DEMO_PASSWORD = 'demo-password-1';

async function main() {
  // Start from a clean workspace so re-seeding is predictable.
  await db.execute(sql`
    truncate table workspaces, users restart identity cascade
  `);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [pi, gradStudent, assistant] = await db
    .insert(users)
    .values([
      { email: DEMO_EMAIL, name: 'Dr Elena Marsh', passwordHash },
      { email: 'j.okafor@labflow.test', name: 'Joseph Okafor', passwordHash },
      { email: 'r.tanaka@labflow.test', name: 'Rin Tanaka', passwordHash },
    ])
    .returning({ id: users.id });
  if (!pi || !gradStudent || !assistant) throw new Error('Could not seed users');

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: 'Demo Environmental Research Lab',
      slug: 'demo-environmental-research-lab',
      institution: 'Riverbank University',
    })
    .returning({ id: workspaces.id });
  if (!workspace) throw new Error('Could not seed workspace');

  await db.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: pi.id, role: 'owner' },
    { workspaceId: workspace.id, userId: gradStudent.id, role: 'member' },
    { workspaceId: workspace.id, userId: assistant.id, role: 'member' },
  ]);

  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      ownerId: pi.id,
      name: 'PFAS Removal Study',
      researchQuestion:
        'Which sorbent and packing configuration gives the longest PFOA breakthrough time under field-relevant flow rates?',
      description:
        'Bench-scale column trials comparing granular activated carbon against a modified anion-exchange resin, at concentrations representative of contaminated groundwater.',
      status: 'active',
      tags: ['pfas', 'sorption', 'water treatment'],
    })
    .returning({ id: projects.id });
  if (!project) throw new Error('Could not seed project');

  const [secondProject] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      ownerId: gradStudent.id,
      name: 'Membrane Fouling Characterisation',
      researchQuestion: 'How does influent organic loading change fouling onset in the pilot membrane unit?',
      status: 'planning',
      tags: ['membranes'],
    })
    .returning({ id: projects.id });

  const [protocol] = await db
    .insert(protocols)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      name: 'PFAS Extraction and Column Loading',
      description: 'Solid-phase extraction followed by column loading and LC-MS/MS quantification.',
    })
    .returning({ id: protocols.id });
  if (!protocol) throw new Error('Could not seed protocol');

  const versionRows = await db
    .insert(protocolVersions)
    .values([
      {
        protocolId: protocol.id,
        version: 1,
        changeNote: 'Initial version.',
        createdById: pi.id,
        body: 'Condition cartridges with methanol, load 250 mL sample at 5 mL/min, elute with 4 mL methanol.',
      },
      {
        protocolId: protocol.id,
        version: 2,
        changeNote: 'Increased rinse volume to 10 mL after recovery losses on the first two runs.',
        createdById: gradStudent.id,
        body: 'As v1, with a 10 mL reagent-water rinse before elution.',
      },
      {
        protocolId: protocol.id,
        version: 3,
        changeNote:
          'Switched to polypropylene collection vials; PTFE vials showed adsorptive loss of PFOA.',
        createdById: gradStudent.id,
        body: 'As v2, collecting eluate in polypropylene vials and analysing within 24 h.',
      },
    ])
    .returning({ id: protocolVersions.id, version: protocolVersions.version });

  const v = (n: number) => versionRows.find((row) => row.version === n)?.id ?? null;

  const sampleRows = await db
    .insert(samples)
    .values(
      Array.from({ length: 20 }, (_, i) => ({
        workspaceId: workspace.id,
        projectId: project.id,
        code: `S-${String(i + 1).padStart(3, '0')}`,
        description:
          i < 8
            ? 'Spiked groundwater matrix, 10 ppb PFOA'
            : i < 14
              ? 'Column effluent fraction'
              : 'Field composite, Site B',
      })),
    )
    .returning({ id: samples.id, code: samples.code });

  const sampleId = (code: string) => sampleRows.find((s) => s.code === code)?.id;

  const experimentSeeds = [
    {
      title: 'Baseline GAC column, 10 ppb PFOA',
      performedOn: '2026-02-03',
      researcherId: gradStudent.id,
      status: 'completed' as const,
      protocolVersionId: v(1),
      objective: 'Establish a baseline breakthrough curve for granular activated carbon at 10 ppb PFOA.',
      hypothesis: 'Breakthrough will occur between 30 and 50 bed volumes at 5 mL/min.',
      conditions: [
        ['Temperature', '25', '°C'],
        ['pH', '7.2', ''],
        ['Influent concentration', '10', 'ppb'],
        ['Flow rate', '5', 'mL/min'],
      ],
      samples: ['S-001', 'S-002', 'S-003'],
      result: {
        summary: 'Breakthrough (C/C0 = 0.1) reached at 34 bed volumes.',
        observations: 'Effluent concentration rose steadily after 28 bed volumes with no plateau.',
        conclusion: 'GAC gives a usable but short breakthrough time under these conditions.',
        nextSteps: 'Repeat with the anion-exchange resin for a direct comparison.',
      },
      notes: ['Column packed the previous evening and left wetted overnight.'],
    },
    {
      title: 'Anion-exchange resin, 10 ppb PFOA',
      performedOn: '2026-02-10',
      researcherId: gradStudent.id,
      status: 'completed' as const,
      protocolVersionId: v(1),
      objective: 'Compare the modified anion-exchange resin against the GAC baseline.',
      hypothesis: 'The resin will delay breakthrough relative to GAC at the same loading.',
      conditions: [
        ['Temperature', '25', '°C'],
        ['pH', '7.2', ''],
        ['Influent concentration', '10', 'ppb'],
        ['Flow rate', '5', 'mL/min'],
      ],
      samples: ['S-004', 'S-005', 'S-006'],
      result: {
        summary: 'Breakthrough reached at 61 bed volumes.',
        observations: 'Recovery in the spike-check samples was only 74%, lower than expected.',
        conclusion: 'The resin roughly doubles breakthrough time, but the recovery shortfall makes the absolute numbers uncertain.',
        nextSteps: 'Investigate the recovery loss before running further comparisons.',
      },
      notes: ['Recovery check flagged during QC review — see the spike-check worksheet.'],
    },
    {
      title: 'Recovery troubleshooting — rinse volume',
      performedOn: '2026-02-18',
      researcherId: assistant.id,
      status: 'needs_investigation' as const,
      protocolVersionId: v(2),
      objective: 'Test whether an increased rinse volume explains the low recovery seen in EXP-002.',
      hypothesis: 'Insufficient rinsing leaves matrix interference that suppresses the PFOA signal.',
      conditions: [
        ['Temperature', '25', '°C'],
        ['pH', '7.2', ''],
        ['Rinse volume', '10', 'mL'],
      ],
      samples: ['S-007', 'S-008'],
      result: {
        summary: 'Recovery improved to 81%, still short of the 90% acceptance criterion.',
        observations: 'Blank vials also showed a small PFOA signal after standing for two days.',
        conclusion: null,
        nextSteps: null,
      },
      notes: [
        'Blank contamination is the surprising part — worth checking the vials themselves rather than the method.',
      ],
    },
    {
      title: 'Vial material check',
      performedOn: '2026-02-24',
      researcherId: assistant.id,
      status: 'completed' as const,
      protocolVersionId: v(3),
      objective: 'Determine whether PTFE collection vials adsorb PFOA over a 48 h hold.',
      hypothesis: 'PTFE vials lose measurable PFOA relative to polypropylene over the same hold time.',
      conditions: [
        ['Hold time', '48', 'h'],
        ['Temperature', '4', '°C'],
      ],
      samples: ['S-009', 'S-010', 'S-011'],
      result: {
        summary: 'PTFE vials showed a 14% mean decrease over 48 h; polypropylene showed 2%.',
        observations: 'The effect was consistent across all three replicate pairs.',
        conclusion: 'Vial material accounts for a substantial part of the earlier recovery shortfall.',
        nextSteps: 'Adopt polypropylene vials in the protocol and repeat EXP-002.',
      },
      notes: [],
    },
    {
      title: 'Anion-exchange resin, repeat with v3 protocol',
      performedOn: '2026-03-05',
      researcherId: gradStudent.id,
      status: 'repeated' as const,
      protocolVersionId: v(3),
      repeats: 1, // index into the seeded list (EXP-002)
      objective: 'Repeat the resin comparison with the corrected vial material and rinse volume.',
      hypothesis: 'Corrected handling will raise recovery above 90% without changing breakthrough time.',
      conditions: [
        ['Temperature', '25', '°C'],
        ['pH', '7.2', ''],
        ['Influent concentration', '10', 'ppb'],
        ['Flow rate', '5', 'mL/min'],
      ],
      samples: ['S-012', 'S-013', 'S-014'],
      result: {
        summary: 'Breakthrough at 58 bed volumes with 93% recovery.',
        observations: 'Breakthrough time is within 5% of the original run; recovery is now acceptable.',
        conclusion: 'The earlier recovery problem was a handling artefact, not a sorbent effect.',
        nextSteps: 'Move to the temperature series.',
      },
      notes: [],
    },
    {
      title: 'Resin at 30 °C',
      performedOn: '2026-03-17',
      researcherId: pi.id,
      status: 'in_progress' as const,
      protocolVersionId: v(3),
      objective: 'Test temperature sensitivity of resin breakthrough at field-relevant summer temperatures.',
      hypothesis: 'Higher temperature reduces breakthrough time through weaker sorption.',
      conditions: [
        ['Temperature', '30', '°C'],
        ['pH', '7.2', ''],
        ['Influent concentration', '10', 'ppb'],
        ['Flow rate', '5', 'mL/min'],
      ],
      samples: ['S-015', 'S-016', 'S-017'],
      result: null,
      notes: ['Column still running at the time of writing.'],
    },
  ];

  const created: string[] = [];
  for (const [index, seed] of experimentSeeds.entries()) {
    const [experiment] = await db
      .insert(experiments)
      .values({
        workspaceId: workspace.id,
        projectId: project.id,
        number: index + 1,
        title: seed.title,
        performedOn: new Date(seed.performedOn),
        researcherId: seed.researcherId,
        status: seed.status,
        objective: seed.objective,
        hypothesis: seed.hypothesis,
        protocolVersionId: seed.protocolVersionId,
        repeatsExperimentId:
          'repeats' in seed && typeof seed.repeats === 'number' ? created[seed.repeats] : null,
      })
      .returning({ id: experiments.id });
    if (!experiment) throw new Error('Could not seed experiment');
    created.push(experiment.id);

    await db.insert(experimentConditions).values(
      seed.conditions.map(([name, value, unit], position) => ({
        experimentId: experiment.id,
        name: name ?? '',
        value: value ?? '',
        unit: unit === '' ? null : (unit ?? null),
        position,
      })),
    );

    const ids = seed.samples.map(sampleId).filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      await db
        .insert(experimentSamples)
        .values(ids.map((id) => ({ experimentId: experiment.id, sampleId: id })));
    }

    if (seed.result) {
      await db.insert(experimentResults).values({ experimentId: experiment.id, ...seed.result });
    }

    for (const body of seed.notes) {
      await db
        .insert(experimentNotes)
        .values({ experimentId: experiment.id, body, authorId: seed.researcherId });
    }
  }

  if (secondProject) {
    await db.insert(experiments).values({
      workspaceId: workspace.id,
      projectId: secondProject.id,
      number: 1,
      title: 'Pilot unit shakedown',
      status: 'planned',
      objective: 'Confirm the pilot membrane unit holds pressure before the fouling series begins.',
      researcherId: gradStudent.id,
    });
  }

  console.info(`Seeded demo workspace. Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
