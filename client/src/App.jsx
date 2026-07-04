import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Display from './pages/Display';
import LoginPage from './pages/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DisplaysTab from './pages/admin/DisplaysTab';
import GamesTab from './pages/admin/GamesTab';
import SkateTab from './pages/admin/SkateTab';
import BackgroundsTab from './pages/admin/BackgroundsTab';
import SettingsPage from './pages/admin/SettingsPage';
import RinkEventsTab from './pages/admin/RinkEventsTab';
import FigureSkatingTab from './pages/admin/FigureSkatingTab';
import LeaguesTab from './pages/admin/LeaguesTab';
import WebpageTab from './pages/admin/WebpageTab';
import AnnouncementTab from './pages/admin/AnnouncementTab';
import CustomTab from './pages/admin/CustomTab';
import { getToken } from './hooks/useApi';

function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/display/:screenId" element={<Display />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={
          <ProtectedRoute><AdminLayout /></ProtectedRoute>
        }>
          <Route index element={<Navigate to="displays" replace />} />
          <Route path="displays" element={<DisplaysTab />} />
          <Route path="games" element={<GamesTab />} />
          <Route path="rink-events" element={<RinkEventsTab />} />
          <Route path="figure-skating" element={<FigureSkatingTab />} />
          <Route path="skate" element={<SkateTab />} />
          <Route path="webpage" element={<WebpageTab />} />
          <Route path="announcements" element={<AnnouncementTab />} />
          <Route path="custom" element={<CustomTab />} />
          <Route path="backgrounds" element={<BackgroundsTab />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="leagues" element={<LeaguesTab />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
