import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ── shared column helpers ──────────────────────────────────────────────── */

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/* ── enums ──────────────────────────────────────────────────────────────── */

export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member']);

export const projectStatus = pgEnum('project_status', [
  'planning',
  'active',
  'on_hold',
  'completed',
  'archived',
]);

/** Deliberately short. Researchers will not maintain a 12-state machine. */
export const experimentStatus = pgEnum('experiment_status', [
  'planned',
  'in_progress',
  'completed',
  'repeated',
  'needs_investigation',
]);

export const aiKind = pgEnum('ai_kind', [
  'experiment_analysis',
  'project_answer',
  'research_memory',
  'research_update',
]);

export const updateStatus = pgEnum('research_update_status', ['draft', 'final']);

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'none',
]);

/* ── identity ───────────────────────────────────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: id(),
    /** Stored normalised (trimmed, lowercased) — see lib/normalise.ts. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ emailIdx: uniqueIndex('users_email_key').on(t.email) }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** SHA-256 of the cookie token — the raw token is never stored. */
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    userIdx: index('sessions_user_id_idx').on(t.userId),
  }),
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ tokenIdx: uniqueIndex('password_reset_token_hash_key').on(t.tokenHash) }),
);

/* ── tenancy ────────────────────────────────────────────────────────────── */

export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    institution: text('institution'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ slugIdx: uniqueIndex('workspaces_slug_key').on(t.slug) }),
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    userIdx: index('workspace_members_user_id_idx').on(t.userId),
  }),
);

/* ── research records ───────────────────────────────────────────────────── */

export const projects = pgTable(
  'projects',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    researchQuestion: text('research_question'),
    status: projectStatus('status').notNull().default('active'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    wsIdx: index('projects_workspace_id_idx').on(t.workspaceId),
    searchIdx: index('projects_search_idx').on(t.name),
  }),
);

export const protocols = pgTable(
  'protocols',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ wsIdx: index('protocols_workspace_id_idx').on(t.workspaceId) }),
);

export const protocolVersions = pgTable(
  'protocol_versions',
  {
    id: id(),
    protocolId: uuid('protocol_id')
      .notNull()
      .references(() => protocols.id, { onDelete: 'cascade' }),
    /** Monotonic per protocol: 1, 2, 3 … rendered as v1, v2, v3. */
    version: integer('version').notNull(),
    /** What changed relative to the previous version, in the author's words. */
    changeNote: text('change_note'),
    body: text('body'),
    fileId: uuid('file_id'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniq: uniqueIndex('protocol_versions_protocol_version_key').on(t.protocolId, t.version),
  }),
);

export const experiments = pgTable(
  'experiments',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Human-facing sequence number, unique within the project (001, 002 …). */
    number: integer('number').notNull(),
    title: text('title').notNull(),
    performedOn: timestamp('performed_on', { withTimezone: true, mode: 'date' }),
    researcherId: uuid('researcher_id').references(() => users.id, { onDelete: 'set null' }),
    objective: text('objective'),
    hypothesis: text('hypothesis'),
    status: experimentStatus('status').notNull().default('planned'),
    protocolVersionId: uuid('protocol_version_id').references(() => protocolVersions.id, {
      onDelete: 'set null',
    }),
    protocolNotes: text('protocol_notes'),
    /** Set when this run repeats an earlier experiment — drives the timeline. */
    repeatsExperimentId: uuid('repeats_experiment_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    projectIdx: index('experiments_project_id_idx').on(t.projectId),
    wsIdx: index('experiments_workspace_id_idx').on(t.workspaceId),
    numberUniq: uniqueIndex('experiments_project_number_key').on(t.projectId, t.number),
  }),
);

export const experimentConditions = pgTable(
  'experiment_conditions',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    /** Free-form on purpose: every field has its own variables. */
    name: text('name').notNull(),
    value: text('value').notNull(),
    unit: text('unit'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ expIdx: index('experiment_conditions_experiment_id_idx').on(t.experimentId) }),
);

export const samples = pgTable(
  'samples',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    description: text('description'),
    parentSampleId: uuid('parent_sample_id'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    codeUniq: uniqueIndex('samples_workspace_code_key').on(t.workspaceId, t.code),
    projectIdx: index('samples_project_id_idx').on(t.projectId),
  }),
);

export const experimentSamples = pgTable(
  'experiment_samples',
  {
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    sampleId: uuid('sample_id')
      .notNull()
      .references(() => samples.id, { onDelete: 'cascade' }),
    role: text('role'),
    createdAt: createdAt(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.experimentId, t.sampleId] }),
    sampleIdx: index('experiment_samples_sample_id_idx').on(t.sampleId),
  }),
);

export const experimentResults = pgTable(
  'experiment_results',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    summary: text('summary'),
    observations: text('observations'),
    conclusion: text('conclusion'),
    nextSteps: text('next_steps'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ expUniq: uniqueIndex('experiment_results_experiment_id_key').on(t.experimentId) }),
);

export const experimentNotes = pgTable(
  'experiment_notes',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ expIdx: index('experiment_notes_experiment_id_idx').on(t.experimentId) }),
);

/* ── files & data ───────────────────────────────────────────────────────── */

export const files = pgTable(
  'files',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    /** Set for uploads; null for links. Resolved by the storage adapter. */
    storageKey: text('storage_key'),
    /** Set for links; null for uploads. The two are mutually exclusive. */
    sourceUrl: text('source_url'),
    /** "google-drive", "dropbox", "web" … derived from the URL host. */
    provider: text('provider'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({ wsIdx: index('files_workspace_id_idx').on(t.workspaceId) }),
);

export const experimentFiles = pgTable(
  'experiment_files',
  {
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.experimentId, t.fileId] }) }),
);

export const datasets = pgTable(
  'datasets',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    /** Parsed rows kept inline; large files stay authoritative on disk. */
    rows: jsonb('rows').$type<Record<string, string>[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ expIdx: index('datasets_experiment_id_idx').on(t.experimentId) }),
);

export const datasetColumns = pgTable(
  'dataset_columns',
  {
    id: id(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    isNumeric: boolean('is_numeric').notNull().default(false),
    /** Descriptive statistics only — never an inferred scientific claim. */
    stats: jsonb('stats').$type<{
      count: number;
      missing: number;
      min?: number;
      max?: number;
      mean?: number;
      stdDev?: number;
    } | null>(),
    createdAt: createdAt(),
  },
  (t) => ({ dsIdx: index('dataset_columns_dataset_id_idx').on(t.datasetId) }),
);

/* ── AI output & research updates ───────────────────────────────────────── */

/**
 * Every AI response is persisted with the evidence it was given, so a
 * researcher can audit what the model actually saw. AI output is never
 * written back into the scientific record automatically.
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'cascade' }),
    kind: aiKind('kind').notNull(),
    prompt: text('prompt'),
    output: jsonb('output').notNull(),
    evidence: jsonb('evidence').$type<{ type: string; id: string; label: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    model: text('model'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({ projIdx: index('ai_generations_project_id_idx').on(t.projectId) }),
);

export const researchUpdates = pgTable(
  'research_updates',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: updateStatus('status').notNull().default('draft'),
    experimentIds: uuid('experiment_ids').array().notNull().default(sql`'{}'::uuid[]`),
    /** Editable slide content — the researcher owns the final wording. */
    sections: jsonb('sections')
      .$type<{ heading: string; body: string; source: 'record' | 'researcher' | 'ai' }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ projIdx: index('research_updates_project_id_idx').on(t.projectId) }),
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type ExperimentCondition = typeof experimentConditions.$inferSelect;
export type Sample = typeof samples.$inferSelect;
export type Protocol = typeof protocols.$inferSelect;
export type ProtocolVersion = typeof protocolVersions.$inferSelect;
export type ExperimentResult = typeof experimentResults.$inferSelect;
export type ExperimentNote = typeof experimentNotes.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type Dataset = typeof datasets.$inferSelect;
export type DatasetColumn = typeof datasetColumns.$inferSelect;
export type ExperimentStatus = (typeof experimentStatus.enumValues)[number];
export type ProjectStatus = (typeof projectStatus.enumValues)[number];

/** Threaded discussion on a project or an experiment. */
export const discussions = pgTable(
  'discussions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'cascade' }),
    /** Null for a top-level message; set for a reply. One level deep only. */
    parentId: uuid('parent_id'),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    expIdx: index('discussions_experiment_idx').on(t.experimentId, t.createdAt),
    projIdx: index('discussions_project_idx').on(t.projectId, t.createdAt),
    parentIdx: index('discussions_parent_idx').on(t.parentId),
  }),
);

/** A PubMed record a researcher pinned to a project. */
export const literatureRefs = pgTable(
  'literature_refs',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pmid: text('pmid').notNull(),
    title: text('title').notNull(),
    journal: text('journal'),
    year: text('year'),
    authors: text('authors'),
    note: text('note'),
    addedById: uuid('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({ uniq: uniqueIndex('literature_refs_project_pmid_key').on(t.projectId, t.pmid) }),
);

export type Discussion = typeof discussions.$inferSelect;
export type LiteratureRef = typeof literatureRefs.$inferSelect;

/** An outstanding invitation to join a workspace. */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceRole('role').notNull().default('member'),
    /** Only the hash is stored; the raw token lives in the invite link. */
    tokenHash: text('token_hash').notNull(),
    invitedById: uuid('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('workspace_invites_token_key').on(t.tokenHash),
    emailIdx: index('workspace_invites_email_idx').on(t.email),
  }),
);

export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;

/** One subscription per workspace. Seats are enforced from here. */
export const workspaceSubscriptions = pgTable(
  'workspace_subscriptions',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    plan: text('plan'),
    status: subscriptionStatus('status').notNull().default('trialing'),
    extraSeats: integer('extra_seats').notNull().default(0),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ wsUniq: uniqueIndex('workspace_subscriptions_workspace_key').on(t.workspaceId) }),
);

/** Stripe retries webhooks; recording ids makes a replay a no-op. */
export const processedStripeEvents = pgTable('processed_stripe_events', {
  id: text('id').primaryKey(),
  createdAt: createdAt(),
});

export type WorkspaceSubscription = typeof workspaceSubscriptions.$inferSelect;
