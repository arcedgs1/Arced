export async function up(k){
 await k.schema.alterTable('estimates',t=>t.jsonb('maker'));
 await k.schema.createTable('estimate_files',t=>{
  t.increments('id');t.integer('estimate_id').notNullable().references('estimates.id').index();
  t.integer('user_id').notNullable().references('users.id');t.text('storage_key').notNullable().unique();
  t.text('filename').notNullable();t.text('mime_type').notNullable();t.integer('size_bytes').notNullable();t.text('sha256').notNullable();
  t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
 });
 await k.schema.createTable('material_price_checks',t=>{
  t.increments('id');t.integer('estimate_id').notNullable().references('estimates.id').index();
  t.integer('user_id').notNullable().references('users.id');t.text('query').notNullable();t.text('location').notNullable();
  t.text('result').notNullable();t.jsonb('sources').notNullable();t.timestamp('checked_at').notNullable().defaultTo(k.fn.now());
 });
}
export async function down(k){await k.schema.dropTable('material_price_checks');await k.schema.dropTable('estimate_files');await k.schema.alterTable('estimates',t=>t.dropColumn('maker'));}
