import { activeCacheOwner, getWorkspaceSession } from './workspaceIdentity';
import { getSessionIdentity } from './firebase';
import { loadData } from './storage';
import { listUploads, getFolders } from './uploads';
import { dataCounts, inspectStoredNamespaces } from './storageDiagnostics';
if (import.meta.hot) {
  import.meta.hot.accept();
  const inspect = async ({ id }: { id: string }) => {
    const user = getSessionIdentity();
    const owner = user ? activeCacheOwner(user.uid) : 'local';
    let result: unknown;
    try {
      const [data, uploads, folders] = await Promise.all([
        loadData(owner),
        listUploads(owner),
        getFolders(owner),
      ]);
      const fileInput = document.querySelector<HTMLInputElement>('.drive-panel input[type=file]');
      const form = fileInput?.form;
      result = {
        origin: location.origin,
        signedIn: Boolean(user),
        ownerFingerprint: Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner))),
        )
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 16),
        companySelected: Boolean(getWorkspaceSession()),
        counts: dataCounts(data),
        namespaces: await inspectStoredNamespaces(owner),
        cloud: await inspectCloud(owner, Boolean(user && getWorkspaceSession())),
        projectCount: data.projects.length,
        activeProjectCount: data.projects.filter((p) => p.status === 'active').length,
        hasRootMapping: Boolean(folders?.rootId),
        projectMappingCount: Object.keys(folders?.projects ?? {}).length,
        view: {
          drivePanelOpen: Boolean(fileInput),
          selectedFileCount: fileInput?.files?.length ?? 0,
          projectSelected: Boolean(
            form?.querySelector<HTMLSelectElement>('[name=projectId]')?.value,
          ),
          invalidFields: form
            ? Array.from(form.elements)
                .filter(
                  (element): element is HTMLInputElement | HTMLSelectElement =>
                    element instanceof HTMLInputElement || element instanceof HTMLSelectElement,
                )
                .filter((element) => !element.validity.valid)
                .map((element) => element.name)
            : [],
          statusText: Array.from(
            document.querySelectorAll('.drive-panel [role=status],.drive-panel [role=alert]'),
          ).map((element) => element.textContent?.slice(0, 300)),
        },
        uploads: uploads.slice(0, 20).map((item) => ({
          status: item.status,
          error: item.error.slice(0, 350),
          hasDriveId: Boolean(item.driveId),
          hasFolderId: Boolean(item.folderId),
          hasOriginal: Boolean(item.blob),
          size: item.size,
          projectExists: data.projects.some((project) => project.id === item.projectId),
        })),
      };
    } catch (error) {
      result = {
        origin: location.origin,
        error: error instanceof Error ? error.message : 'read-error',
      };
    }
    await fetch(`/__dev/upload-diagnostics/report?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }).catch(() => {});
  };
  import.meta.hot.on('construction:upload-diagnostics', inspect);
  import.meta.hot.dispose(() => import.meta.hot?.off('construction:upload-diagnostics', inspect));
}

async function inspectCloud(owner: string, enabled: boolean) {
  if (!enabled) return { status: 'not-inspected' };
  try {
    const { pullCloud } = await import('./cloudFirestore');
    const batch = await pullCloud(owner, {});
    return {
      status: 'server-read',
      collections: Object.fromEntries(
        ['projects', 'masters', 'trips', 'workspaces'].map((kind) => [
          kind,
          batch.records.filter((item) => item.collection === kind && !item.record.deletedAt).length,
        ]),
      ),
      masters: Object.fromEntries(
        ['truck', 'driver', 'source', 'customer', 'soilType', 'tag'].map((kind) => [
          kind,
          batch.records.filter(
            ({ collection, record }) =>
              collection === 'masters' &&
              !record.deletedAt &&
              'kind' in record.payload &&
              record.payload.kind === kind,
          ).length,
        ]),
      ),
    };
  } catch (error) {
    return {
      status: 'error',
      code:
        error && typeof error === 'object' && 'code' in error ? String(error.code) : 'read-error',
    };
  }
}
