import { firebaseWebData } from '@/lib/server/firebase/data';

import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import 'server-only';

/** The existing upload actions use one provider with the same DTO contract. */
export async function mediaActionClient() {
  await requireFirebaseActionOrigin();
  return firebaseWebData();
}
