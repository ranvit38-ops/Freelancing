import { db } from '@/db';
import {
  experimentConditions,
  experimentResults,
  experiments,
  projects,
  protocolVersions,
  protocols,
} from '@/db/schema';

/**
 * The worked example a new workspace starts with.
 *
 * Nobody's first minute should be an empty screen. This is a small, real-
 * shaped project: two runs of the same protocol that differ in one condition
 * and one reagent lot, which is the thing Labvia exists to make visible.
 *
 * It is deliberately marked rather than disguised. It carries isExample, the
 * name says what it is, and one button removes it. Seeding data that pretends
 * to be the customer's own would be worse than an empty screen.
 *
 * It also never counts against plan limits, so a free workspace still has its
 * own project to spend.
 */
export async function seedExampleProject(workspaceId: string, ownerId: string): Promise<void> {
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId,
      ownerId,
      isExample: true,
      name: 'Example: PFAS removal by activated carbon',
      status: 'active',
      researchQuestion:
        'Does acid-washing the carbon improve PFOA removal, and does the improvement hold across carbon lots?',
      description:
        'A worked example so you can see a full record before entering your own. Delete it whenever you like; it does not count against your plan.',
      tags: ['example'],
    })
    .returning({ id: projects.id });
  if (!project) return;

  const [protocol] = await db
    .insert(protocols)
    .values({
      workspaceId,
      projectId: project.id,
      name: 'GAC column, 30 minute contact',
      description:
        'Packed column, equilibrate, load spiked matrix, sample at fixed bed volumes.',
    })
    .returning({ id: protocols.id });

  let versionId: string | null = null;
  if (protocol) {
    const [version] = await db
      .insert(protocolVersions)
      .values({
        protocolId: protocol.id,
        version: 1,
        createdById: ownerId,
        body: [
          '1. Pack 10 g granular activated carbon into a glass column.',
          '2. Equilibrate with 50 bed volumes of deionised water.',
          '3. Load groundwater matrix spiked to 100 ppt PFOA.',
          '4. Sample effluent at 50, 100, 200 and 400 bed volumes.',
          '5. Quantify by LC-MS/MS against a six-point calibration.',
        ].join('\n'),
      })
      .returning({ id: protocolVersions.id });
    versionId = version?.id ?? null;
  }

  // Two runs that differ in one condition and one carbon lot. The comparison
  // between them is the point of the example.
  const runs = [
    {
      number: 1,
      title: 'Untreated carbon, lot GR-3361',
      objective: 'Establish baseline PFOA removal with carbon as supplied.',
      hypothesis: 'Untreated carbon removes at least 80 percent of PFOA at 200 bed volumes.',
      status: 'completed' as const,
      conditions: [
        { name: 'Carbon pretreatment', value: 'none', unit: null },
        { name: 'Contact time', value: '30', unit: 'min' },
        { name: 'Carbon lot', value: 'GR-3361', unit: null },
        { name: 'Temperature', value: '25', unit: '°C' },
      ],
      result: {
        summary: '84 percent PFOA removal at 200 bed volumes, breakthrough beginning by 400.',
        observations:
          'Removal was steady to 200 bed volumes, then fell away quickly. Effluent pH unchanged.',
        conclusion: 'Untreated carbon meets the 80 percent target but has little margin.',
        nextSteps: 'Repeat with acid-washed carbon to see whether the margin improves.',
      },
    },
    {
      number: 2,
      title: 'Acid-washed carbon, lot GR-3362',
      objective: 'Test whether acid-washing improves removal over the baseline.',
      hypothesis: 'Acid-washed carbon exceeds 90 percent removal at 200 bed volumes.',
      status: 'needs_investigation' as const,
      conditions: [
        { name: 'Carbon pretreatment', value: 'acid-washed, 1 M HCl', unit: null },
        { name: 'Contact time', value: '30', unit: 'min' },
        { name: 'Carbon lot', value: 'GR-3362', unit: null },
        { name: 'Temperature', value: '25', unit: '°C' },
      ],
      result: {
        summary: '71 percent removal at 200 bed volumes, worse than the untreated baseline.',
        observations:
          'Removal was lower throughout, not only at breakthrough. Effluent pH dropped to 5.8 in the first 20 bed volumes.',
        conclusion:
          'Acid-washing did not help. Two things changed between these runs, so the cause is not yet established.',
        nextSteps:
          'Repeat the acid wash on lot GR-3361 to separate the pretreatment from the lot. Compare the two runs to see both differences at once.',
      },
    },
  ];

  for (const run of runs) {
    const [experiment] = await db
      .insert(experiments)
      .values({
        workspaceId,
        projectId: project.id,
        number: run.number,
        title: run.title,
        objective: run.objective,
        hypothesis: run.hypothesis,
        status: run.status,
        researcherId: ownerId,
        protocolVersionId: versionId,
        performedOn: new Date(Date.now() - (3 - run.number) * 7 * 86_400_000),
      })
      .returning({ id: experiments.id });
    if (!experiment) continue;

    await db.insert(experimentConditions).values(
      run.conditions.map((condition) => ({
        workspaceId,
        experimentId: experiment.id,
        ...condition,
      })),
    );
    await db.insert(experimentResults).values({
      experimentId: experiment.id,
      ...run.result,
    });
  }
}
