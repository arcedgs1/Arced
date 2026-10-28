export async function up(k){
 await k.schema.alterTable('time_entries',t=>{t.integer('version').notNullable().defaultTo(1);t.timestamp('corrected_at');t.text('correction_reason');});
 await k.schema.createTable('time_corrections',t=>{t.increments('id');t.integer('time_entry_id').notNullable().references('time_entries.id');t.integer('user_id').notNullable().references('users.id');t.text('reason').notNullable();t.jsonb('before').notNullable();t.jsonb('after').notNullable();t.timestamp('created_at').notNullable().defaultTo(k.fn.now());});
}
export async function down(k){await k.schema.dropTable('time_corrections');await k.schema.alterTable('time_entries',t=>{t.dropColumn('version');t.dropColumn('corrected_at');t.dropColumn('correction_reason');});}
