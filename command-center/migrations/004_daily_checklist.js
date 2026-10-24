export async function up(k){
  await k.schema.createTable('daily_tasks',t=>{
    t.increments('id');
    t.text('title').notNullable();
    t.text('notes').notNullable().defaultTo('');
    t.text('priority').notNullable().defaultTo('normal');
    t.text('status').notNullable().defaultTo('open');
    t.date('due_date');
    t.integer('job_id').references('jobs.id');
    t.jsonb('steps').notNullable().defaultTo('[]');
    t.integer('created_by').notNullable().references('users.id');
    t.integer('completed_by').references('users.id');
    t.timestamp('completed_at');
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
    t.integer('version').notNullable().defaultTo(1);
    t.uuid('request_key').unique().notNullable();
    t.check("priority IN ('low','normal','high','urgent')");
    t.check("status IN ('open','in_progress','done')");
  });
}
export async function down(k){await k.schema.dropTable('daily_tasks');}
