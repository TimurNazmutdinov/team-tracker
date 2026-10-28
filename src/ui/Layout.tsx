import { Outlet } from 'react-router';
import { AppBar } from './AppBar';
import { Notices } from './Notices';

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <AppBar />
      <Notices />
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
