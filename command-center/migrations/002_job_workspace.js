export async function up(k) {
  await k.schema.alterTable('jobs', t => {
    t.bigInteger('budget_cents').notNullable().defaultTo(0);
    t.bigInteger('original_contract_cents');
    t.check('budget_cents >= 0', [], 'jobs_budget_nonnegative');
    t.check('contract_cents >= 0', [], 'jobs_contract_nonnegative');
  });
  await k('jobs').update({original_contract_cents:k.ref('contract_cents')});
  await k.schema.createTable('job_tasks', t => {
    t.increments('id');
    t.integer('job_id').notNullable().references('jobs.id').index();
    t.text('title').notNullable();
    t.text('status').notNullable().defaultTo('open');
    t.date('due_date');
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
    t.check("status IN ('open','done')");
  });
  await k.schema.createTable('job_notes', t => {
    t.increments('id');
    t.integer('job_id').notNullable().references('jobs.id').index();
    t.integer('user_id').notNullable().references('users.id');
    t.text('body').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
  });
  await k.schema.createTable('change_orders', t => {
    t.increments('id');
    t.integer('job_id').notNullable().references('jobs.id').index();
    t.text('title').notNullable();
    t.text('scope').notNullable();
    t.bigInteger('amount_cents').notNullable();
    t.bigInteger('budget_delta_cents').notNullable().defaultTo(0);
    t.text('status').notNullable().defaultTo('draft');
    t.integer('version').notNullable().defaultTo(1);
    t.text('signer');
    t.timestamp('approved_at');
    t.jsonb('approved_document');
    t.text('request_key').notNullable().unique();
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
    t.check("status IN ('draft','approved')");
  });
  await k.schema.alterTable('clients', t => t.integer('version').notNullable().defaultTo(1));
  await k.schema.alterTable('properties', t => t.integer('version').notNullable().defaultTo(1));
}
export async function down(k) {
  for (const table of ['change_orders','job_notes','job_tasks']) await k.schema.dropTable(table);
  await k.schema.alterTable('jobs', t => {t.dropColumn('budget_cents');t.dropColumn('original_contract_cents');});
  await k.schema.alterTable('clients', t => t.dropColumn('version'));
  await k.schema.alterTable('properties', t => t.dropColumn('version'));
}
