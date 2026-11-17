import deploymentDomains from './deployment-domains.json' with { type: 'json' };
import productionFirebase from './firebase-applet-config.json' with { type: 'json' };
export function previewConfiguration(env:NodeJS.ProcessEnv=process.env){
  if(env.VERCEL_ENV!=='preview')return {preview:false,missing:[] as string[]};
  const missing:string[]=[];
  if(!env.FIREBASE_PROJECT_ID||env.FIREBASE_PROJECT_ID===productionFirebase.projectId)missing.push('FIREBASE_PROJECT_ID (a separate development Firebase project)');
  for(const key of ['VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_APP_ID'])if(!env[key])missing.push(key);
  if(env.FIREBASE_PROJECT_ID&&env.VITE_FIREBASE_PROJECT_ID&&env.FIREBASE_PROJECT_ID!==env.VITE_FIREBASE_PROJECT_ID)missing.push('matching server and browser Firebase project IDs');
  return {preview:true,missing};
}
export function assertPreviewConfiguration(env:NodeJS.ProcessEnv=process.env){const config=previewConfiguration(env);if(config.missing.length)throw new Error('Development preview configuration required: '+config.missing.join(', '));}
export function operationsApplicationOrigin(localHost:string,env:NodeJS.ProcessEnv=process.env){
  if(env.VERCEL_ENV==='preview'){
    const url=new URL(deploymentDomains.developmentOrigin);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('The fixed development origin must be a valid HTTPS origin.');
    return url.origin;
  }
  if(env.PUBLIC_APP_URL){const url=new URL(env.PUBLIC_APP_URL);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol)||(env.NODE_ENV==='production'&&url.protocol!=='https:'))throw new Error('PUBLIC_APP_URL must be the canonical HTTPS origin.');return url.origin;}
  if(env.NODE_ENV!=='production'&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(localHost))return `http://${localHost}`;
  throw new Error('Set PUBLIC_APP_URL to the canonical HTTPS application origin.');
}
