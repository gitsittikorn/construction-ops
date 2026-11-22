// Membership authorizes the caller's own Drive credentials, never company-owner
// credentials. Read functions are injected so this boundary is independently tested.
export async function companyAuthorization(uid, requestedCompany, read) {
  const company = requestedCompany || uid;
  if (typeof company !== 'string' || !company || company.length > 128 || company.includes('/'))
    return false;
  const root = await read.admin(company);
  if (root?.enabled !== true) return false;
  const profile = await read.company(company);
  // Policy companies must use the verified-Google allowlist service, never the
  // legacy owner shortcut or a client-supplied role.
  if (profile?.accessPolicy === 'allowlist-v1') return false;
  if (company === uid) return true;
  if (profile?.ownerUid !== company) return false;
  const membership = await read.member(company, uid);
  return (
    membership?.uid === uid &&
    membership.enabled === true &&
    ['manager', 'operator'].includes(membership.role)
  );
}
