import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';

import Home from './pages/Home/Home';
import Login from './pages/Login/Login';
import AdminLogin from './pages/AdminLogin/AdminLogin';
import Join from './pages/Join/Join';
import Story from './pages/Story/Story';
import Leadership from './pages/Leadership/Leadership';
import Events from './pages/Events/Events';
import ForumIndex from './pages/Forum/ForumIndex';
import ForumCategory from './pages/Forum/ForumCategory';
import ForumPost from './pages/Forum/ForumPost';
import ForumNewPost from './pages/Forum/ForumNewPost';
import Leaderboards from './pages/Leaderboards/Leaderboards';
import Profile from './pages/Profile/Profile';
import Admin from './pages/Admin/Admin';
import OfficerToolkitAuth from './pages/OfficerToolkit/OfficerToolkitAuth';
import WowAddon from './pages/WowAddon/WowAddon';
import Overlord from './pages/Overlord/Overlord';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/join" element={<Join />} />
        <Route path="/story" element={<Story />} />
        <Route path="/leadership" element={<Leadership />} />

        {/* Hidden "Overlord" daily-newsletter archive. Deliberately NOT in
            the nav — direct-link only (mdga.gg/overlord). Public read;
            officers get an inline upload + delete panel on the page. */}
        <Route path="/overlord" element={<Overlord />} />

        <Route path="/events" element={<Events />} />

        {/* Auth-required */}
        <Route path="/forum" element={<ProtectedRoute><ForumIndex /></ProtectedRoute>} />
        <Route path="/forum/category/:slug" element={<ProtectedRoute><ForumCategory /></ProtectedRoute>} />
        <Route path="/forum/post/:id" element={<ProtectedRoute><ForumPost /></ProtectedRoute>} />
        <Route path="/forum/new/:slug" element={<ProtectedRoute><ForumNewPost /></ProtectedRoute>} />
        <Route path="/leaderboards" element={<Leaderboards />} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Officer Toolkit sign-in code generator (Tauri desktop app
            auth handoff). Officer-only gate is enforced inside the
            page itself + the server endpoint. */}
        <Route path="/officer-toolkit/auth" element={<ProtectedRoute><OfficerToolkitAuth /></ProtectedRoute>} />

        {/* WoW addon download page (forum #72). Officer-gated link in the
            user dropdown; page redirects non-officers via its own check
            as well. The /wow_addon/* static mount serves the zip file
            and is intentionally NOT auth-gated. */}
        <Route path="/wow-addon" element={<ProtectedRoute requireOfficer><WowAddon /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* Admin runs OUTSIDE the regular site Layout — it has its own
          full-viewport shell (sidebar nav, page header, etc.) so the
          marketing-site nav and footer don't constrain or duplicate it. */}
      <Route path="/admin" element={<ProtectedRoute requireOfficer><Admin /></ProtectedRoute>} />
    </Routes>
  );
}
