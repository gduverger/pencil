/**
 * Drizzle schema for Postgres (spec 11.3). Every table carries created_at; ids are UUIDs except
 * the Auth.js tables, which use text ids as the adapter expects, and benchmarks, whose seed rows
 * keep their CSV-derived ids.
 */
import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  letterheadKey: text('letterhead_key'),
  settings: jsonb('settings').notNull().default({}),
  tier: text('tier').notNull().default('free'),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  createdAt: createdAt(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memberships_user_org').on(t.userId, t.orgId)],
);

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: jsonb('address').notNull().default({}),
    town: text('town'),
    isTemplate: boolean('is_template').notNull().default(false),
    clonedFrom: uuid('cloned_from'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    rev: integer('rev').notNull().default(1),
  },
  (t) => [index('deals_org').on(t.orgId)],
);

export const dealState = pgTable('deal_state', {
  dealId: uuid('deal_id')
    .primaryKey()
    .references(() => deals.id, { onDelete: 'cascade' }),
  inputs: jsonb('inputs').notNull().default({}),
  elaboration: jsonb('elaboration').notNull().default({}),
  switches: jsonb('switches').notNull().default({}),
  events: jsonb('events').notNull().default([]),
  scenarios: jsonb('scenarios').notNull().default({}),
  sensitivities: jsonb('sensitivities').notNull().default([]),
  packageSettings: jsonb('package_settings').notNull().default({}),
  assistantTranscript: jsonb('assistant_transcript').notNull().default([]),
  setup: jsonb('setup').notNull().default({}),
  createdAt: createdAt(),
});

export const inputHistory = pgTable(
  'input_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    scenario: text('scenario').notNull(),
    path: text('path').notNull(),
    priorValue: jsonb('prior_value'),
    priorSource: text('prior_source'),
    priorNote: text('prior_note'),
    changedBy: text('changed_by').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('input_history_deal_path').on(t.dealId, t.path)],
);

export const versions = pgTable(
  'versions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    outputs: jsonb('outputs').notNull(),
    engineVersion: text('engine_version').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
  },
  (t) => [uniqueIndex('versions_deal_number').on(t.dealId, t.number)],
);

export const files = pgTable('files', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  versionId: uuid('version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: createdAt(),
});

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  versionId: uuid('version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  createdBy: text('created_by').notNull(),
  createdAt: createdAt(),
});

export const benchmarks = pgTable(
  'benchmarks',
  {
    id: text('id').primaryKey(),
    metric: text('metric').notNull(),
    segment: jsonb('segment').notNull().default({}),
    low: doublePrecision('low').notNull(),
    mid: doublePrecision('mid').notNull(),
    high: doublePrecision('high').notNull(),
    unit: text('unit').notNull(),
    asOf: text('as_of').notNull(),
    source: text('source').notNull(),
    contributorOrgId: uuid('contributor_org_id'),
    sampleSize: integer('sample_size'),
    createdAt: createdAt(),
  },
  (t) => [index('benchmarks_metric').on(t.metric)],
);

export const towns = pgTable('towns', {
  town: text('town').primaryKey(),
  cluster: text('cluster').notNull(),
  residentialTaxRate: doublePrecision('residential_tax_rate'),
  assessorUrl: text('assessor_url').notNull().default(''),
  mbtaStatus: text('mbta_status').notNull().default(''),
  createdAt: createdAt(),
});

export const contributions = pgTable(
  'contributions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    metric: text('metric').notNull(),
    segment: jsonb('segment').notNull().default({}),
    value: doublePrecision('value').notNull(),
    exportedMonth: text('exported_month').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('contributions_metric').on(t.metric)],
);

export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
  stripeRef: text('stripe_ref'),
  createdAt: createdAt(),
});

export const assistantUsage = pgTable('assistant_usage', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  month: text('month').notNull(),
  requests: integer('requests').notNull().default(0),
  tokens: integer('tokens').notNull().default(0),
  createdAt: createdAt(),
});
