import knex from 'knex';
import pg from 'pg';
// A PostgreSQL DATE is a calendar date, not an instant in the host timezone.
pg.types.setTypeParser(1082,value=>value);
export const db=knex({client:'pg',connection:process.env.DATABASE_URL,pool:{min:0,max:10}});
