import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Nav from './Nav';
import Footer from './Footer';
import BackToTop from '../common/BackToTop';
import AppShell from './AppShell';
import useSiteBackground from '../../hooks/useSiteBackground';

export default function Layout() {
  const { pathname } = useLocation();

  // Sets --site-bg-image on <html> for the global faded background layer.
  // Home overlays its own full-strength version on top.
  useSiteBackground();

  // Scroll to top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <AppShell>
      <Nav />
      <main className="m-main">
        <div className="m-page">
          <Outlet />
        </div>
      </main>
      <Footer />
      <BackToTop />
    </AppShell>
  );
}
