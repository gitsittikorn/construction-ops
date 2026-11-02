import { getSessionIdentity } from './firebase';
import { loadData } from './storage';
import { listUploads, getFolders } from './uploads';
if (import.meta.hot) {
  const inspect = async ({ id }: { id: string }) => {
    const user = getSessionIdentity();
    const owner = user?.uid ?? 'local';
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
