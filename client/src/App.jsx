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

        <Route path="/events" element={<Events />} />

        {/* Auth-required */}
        <Route path="/forum" element={<ProtectedRoute><ForumIndex /></ProtectedRoute>} />
        <Route path="/forum/category/:slug" element={<ProtectedRoute><ForumCategory /></ProtectedRoute>} />
        <Route path="/forum/post/:id" element={<ProtectedRoute><ForumPost /></ProtectedRoute>} />
        <Route path="/forum/new/:slug" element={<ProtectedRoute><ForumNewPost /></ProtectedRoute>} />
        <Route path="/leaderboards" element={<ProtectedRoute><Leaderboards /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Officer+ */}
        <Route path="/admin" element={<ProtectedRoute requireOfficer><Admin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
