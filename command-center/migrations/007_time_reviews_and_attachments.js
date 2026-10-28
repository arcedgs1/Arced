export async function up(k){
 await k.schema.alterTable('time_entries',t=>{t.text('review_status').notNullable().defaultTo('draft');t.timestamp('submitted_at');t.integer('submitted_version');t.text('rejection_reason');t.check("review_status IN ('draft','submitted','rejected','approved','legacy_pending')",[],'time_review_status_valid');});
 await k('time_entries').whereNotNull('approved_at').update({review_status:'approved'});
 // Preserve eligibility of historical pending entries without inventing employee consent.
 await k('time_entries').whereNotNull('clock_out').whereNull('approved_at').update({review_status:'legacy_pending',submitted_version:k.ref('version')});
 await k.schema.createTable('time_reviews',t=>{t.increments('id');t.integer('time_entry_id').notNullable().references('time_entries.id');t.integer('user_id').references('users.id');t.text('action').notNullable();t.text('reason').notNullable().defaultTo('');t.timestamp('created_at').notNullable().defaultTo(k.fn.now());});
 await k.raw('ALTER TABLE job_files ALTER COLUMN job_id DROP NOT NULL');
 await k.schema.alterTable('job_files',t=>{t.integer('business_expense_id').references('business_expenses.id');t.integer('equipment_id').references('equipment.id');t.check('num_nonnulls(job_id,business_expense_id,equipment_id) = 1',[],'private_file_one_parent');});
}
export async function down(k){
 if(await k('time_reviews').first())throw Error('Cannot roll back while review history exists. Preserve/migrate the audit trail first.');
 // Removing attachment support would discard references: require an explicit data-preservation decision.
 if(await k('job_files').whereNotNull('business_expense_id').orWhereNotNull('equipment_id').first())throw Error('Cannot roll back while operations attachments exist. Preserve/migrate them first.');
 await k.schema.alterTable('job_files',t=>{t.dropChecks('private_file_one_parent');t.dropColumn('business_expense_id');t.dropColumn('equipment_id');});
 await k.raw('ALTER TABLE job_files ALTER COLUMN job_id SET NOT NULL');
 await k.schema.dropTable('time_reviews');
 await k.schema.alterTable('time_entries',t=>{t.dropColumn('review_status');t.dropColumn('submitted_at');t.dropColumn('submitted_version');t.dropColumn('rejection_reason');});
}
