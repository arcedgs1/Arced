import {z} from 'zod';
export function ownerSettings(env){
 const email=env.SETUP_OWNER_EMAIL?.trim();
 if(!email)throw Error('Owner setup: SETUP_OWNER_EMAIL is missing or empty in the web service runtime environment.');
 if(!z.email().safeParse(email).success)throw Error('Owner setup: SETUP_OWNER_EMAIL is not a valid email address. Check for quotation marks or copied labels in its Value box.');
 const password=env.SETUP_OWNER_PASSWORD;
 if(!password)throw Error('Owner setup: SETUP_OWNER_PASSWORD is missing or empty in the web service runtime environment.');
 if(password.length<12)throw Error('Owner setup: SETUP_OWNER_PASSWORD has fewer than 12 characters.');
 if(password.length>200)throw Error('Owner setup: SETUP_OWNER_PASSWORD has more than 200 characters.');
 return {email,password};
}
