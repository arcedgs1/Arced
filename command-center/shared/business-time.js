import {Temporal} from '@js-temporal/polyfill';
export const BUSINESS_TIMEZONE='America/New_York';
export function businessInstant(local) {
  if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local))throw Error('Enter a valid New York date and time.');
  try {
    return Temporal.PlainDateTime.from(local).toZonedDateTime(BUSINESS_TIMEZONE,{disambiguation:'reject'}).toInstant().toString();
  } catch {
    throw Error('This New York time is invalid or occurs twice during a daylight-saving change. Choose a different time.');
  }
}
export function businessLocal(instant,smallestUnit='minute') {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(BUSINESS_TIMEZONE).toPlainDateTime().toString({smallestUnit});
}
