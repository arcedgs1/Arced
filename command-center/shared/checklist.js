import {Temporal} from '@js-temporal/polyfill';
export const checklistToday=()=>Temporal.Now.plainDateISO('America/New_York').toString();
export function checklistView(tasks,view,today=checklistToday()){
  const rank={urgent:0,high:1,normal:2,low:3};
  return tasks.filter(t=>view==='Completed'?t.status==='done':t.status!=='done'&&(view==='All open'||(view==='Today'&&(!t.due_date||t.due_date<=today))||(view==='Overdue'&&t.due_date&&t.due_date<today)||(view==='Upcoming'&&t.due_date&&t.due_date>today)))
    .sort((a,b)=>view==='Completed'?String(b.completed_at).localeCompare(String(a.completed_at)):rank[a.priority]-rank[b.priority]||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||a.id-b.id);
}
