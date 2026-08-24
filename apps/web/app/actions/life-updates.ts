'use server';

import type { LifeUpdateId } from '@paldora/domain';
import { authenticatedApiClient } from '../lib/api';
import { mutateAndRedirect } from '../lib/action-result';

export async function deleteLifeUpdateAction(
  lifeUpdateId: string,
  returnPath: string,
) {
  return mutateAndRedirect(returnPath, 'Life Update deleted.', async () =>
    (await authenticatedApiClient()).deleteLifeUpdate(
      lifeUpdateId as LifeUpdateId,
    ),
  );
}
