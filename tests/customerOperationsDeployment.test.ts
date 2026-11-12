import test from 'node:test';
import assert from 'node:assert/strict';
import {previewConfiguration,assertPreviewConfiguration,operationsApplicationOrigin} from '../customerOperationsDeployment.js';
test('preview requires a separate, consistently configured Firebase project',()=>{
 assert.throws(()=>assertPreviewConfiguration({VERCEL_ENV:'preview'}));
 assert.throws(()=>assertPreviewConfiguration({VERCEL_ENV:'preview',FIREBASE_PROJECT_ID:'gen-lang-client-0961556565'}));
 const env={VERCEL_ENV:'preview',FIREBASE_PROJECT_ID:'isolated-development',VITE_FIREBASE_PROJECT_ID:'isolated-development',VITE_FIREBASE_API_KEY:'fixture-public-key',VITE_FIREBASE_AUTH_DOMAIN:'isolated-development.firebaseapp.com',VITE_FIREBASE_APP_ID:'fixture-public-app'};
 assert.equal(previewConfiguration(env).missing.length,0);assert.doesNotThrow(()=>assertPreviewConfiguration(env));assert.throws(()=>assertPreviewConfiguration({...env,VITE_FIREBASE_PROJECT_ID:'other'}));
});
test('preview links stay on their branch instead of using a production canonical URL',()=>{
 const env={VERCEL_ENV:'preview',NODE_ENV:'production',VERCEL_BRANCH_URL:'merk-discoveryflow-git-dev-merk3.vercel.app',VERCEL_URL:'random-deployment.vercel.app',PUBLIC_APP_URL:'https://production.example'};
 assert.equal(operationsApplicationOrigin('attacker.example',env),'https://merk-discoveryflow-git-dev-merk3.vercel.app');assert.throws(()=>operationsApplicationOrigin('attacker.example',{...env,VERCEL_BRANCH_URL:'attacker.example'}));assert.throws(()=>operationsApplicationOrigin('attacker.example',{VERCEL_ENV:'preview',PUBLIC_APP_URL:'https://production.example'}));
});
test('local and production link origins reject host injection and insecure production URLs',()=>{
 assert.equal(operationsApplicationOrigin('localhost:3000',{NODE_ENV:'development'}),'http://localhost:3000');assert.throws(()=>operationsApplicationOrigin('attacker.example',{NODE_ENV:'development'}));assert.throws(()=>operationsApplicationOrigin('localhost:3000',{NODE_ENV:'production'}));assert.throws(()=>operationsApplicationOrigin('',{NODE_ENV:'production',PUBLIC_APP_URL:'http://example.com'}));assert.equal(operationsApplicationOrigin('',{NODE_ENV:'production',PUBLIC_APP_URL:'https://example.com/'}),'https://example.com');
});
