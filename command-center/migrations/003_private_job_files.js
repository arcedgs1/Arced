export async function up(k) {
  await k.schema.createTable('job_files',t=>{
    t.increments('id');
    t.integer('job_id').notNullable().references('jobs.id').index();
    t.integer('user_id').notNullable().references('users.id');
    t.uuid('storage_key').notNullable().unique();
    t.text('filename').notNullable();
    t.text('mime_type').notNullable();
    t.integer('size_bytes').notNullable();
    t.text('sha256').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
    t.check('size_bytes > 0 AND size_bytes <= 10485760');
  });
}
export async function down(k) {await k.schema.dropTable('job_files');}
