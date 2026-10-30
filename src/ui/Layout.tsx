import { Outlet } from 'react-router';
import { BackupWarning } from '../modules/backups/BackupWarning';
import { HelpDialog } from '../modules/help/HelpDialog';
import { OnboardingWizard } from '../modules/help/OnboardingWizard';
import { CommandPalette, QuickKeys } from '../modules/quick/CommandPalette';
import { AppBar } from './AppBar';
import { Notices } from './Notices';

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <AppBar />
      <BackupWarning />
      <Notices />
      <QuickKeys />
      <CommandPalette />
      <HelpDialog />
      <OnboardingWizard />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
