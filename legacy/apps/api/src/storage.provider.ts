import type { FactoryProvider } from '@nestjs/common';
import { parseApiEnvironment } from '@paldora/config';
import { S3ObjectStorage } from '@paldora/storage';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export const objectStorageProvider: FactoryProvider = {
  provide: OBJECT_STORAGE,
  useFactory: () => {
    const environment = parseApiEnvironment(process.env);
    return new S3ObjectStorage({
      ...(environment.S3_ENDPOINT ? { endpoint: environment.S3_ENDPOINT } : {}),
      region: environment.S3_REGION,
      bucket: environment.S3_BUCKET,
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    });
  },
};
