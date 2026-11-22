import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccessStore } from '../accessStore.mjs';
import { prepareAccessBootstrap, applyAccessBootstrap } from '../bootstrapAccess.mjs';

const { values } = parseArgs({
  options: {
    'project-id': { type: 'string' },
    'company-id': { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
    apply: { type: 'boolean', default: false },
    emulator: { type: 'boolean', default: false },
  },
});
if (!values['project-id'] || !values['company-id'] || !values.email)
  throw Error(
    'Required: --project-id PROJECT --company-id EXISTING_FOUNDER_UID --email GOOGLE_EMAIL [--name COMPANY]. Default: dry-run; --apply explicitly enables reviewed access-only migration.',
  );
if (
  Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) !==
  values.emulator
)
  throw Error('Explicit --emulator flag must match emulator environment configuration');
initializeApp({ projectId: values['project-id'], credential: applicationDefault() });
const store = createAccessStore(getFirestore());
const plan = await prepareAccessBootstrap({
  store,
  auth: getAuth(),
  companyId: values['company-id'],
  email: values.email,
  companyName: values.name,
});
console.log(
  JSON.stringify({
    mode: values.apply ? 'apply' : 'dry-run',
    alreadyActive: plan.alreadyActive,
    migratedCount: plan.entries?.length ?? 0,
    businessDataModified: false,
  }),
);
if (values.apply) console.log(JSON.stringify(await applyAccessBootstrap(store, plan)));
