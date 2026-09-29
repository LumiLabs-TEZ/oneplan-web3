import { resetRewardAllowance } from './rewardAllowance';
import { registerSignOutHook } from '@/auth/signOutHooks';
import { extractionService } from '@/sse/extractionService';
import { boardPickStore } from './boardPickStore';
let installed = false;
export function installBoardSignOutHook() {
  if (installed) return;
  installed = true;
  registerSignOutHook(async () => {
    extractionService.reset();
    boardPickStore.reset();
    resetRewardAllowance();
  });
}
