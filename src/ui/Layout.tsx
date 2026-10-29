import { Outlet } from 'react-router';
import { BackupWarning } from '../modules/backups/BackupWarning';
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
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
