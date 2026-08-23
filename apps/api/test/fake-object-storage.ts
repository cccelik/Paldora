import type { ObjectStorage } from '@paldora/storage';

export function createFakeObjectStorage(): ObjectStorage {
  return {
    createSignedDownload: async (objectKey) => `signed:${objectKey}`,
    createSignedUpload: async () => {
      throw new Error('Uploads are outside this test.');
    },
    deleteObject: async () => undefined,
    inspectObject: async () => null,
  };
}
