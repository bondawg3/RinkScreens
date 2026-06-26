import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Display from './pages/Display';
import AdminLayout from './pages/admin/AdminLayout';
import ScreensTab from './pages/admin/ScreensTab';
import GamesTab from './pages/admin/GamesTab';
import SkateTab from './pages/admin/SkateTab';
import BackgroundsTab from './pages/admin/BackgroundsTab';
import SettingsTab from './pages/admin/SettingsTab';
import RinkSettingsTab from './pages/admin/RinkSettingsTab';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/display/:screenId" element={<Display />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="screens" replace />} />
          <Route path="screens" element={<ScreensTab />} />
          <Route path="games" element={<GamesTab />} />
          <Route path="skate" element={<SkateTab />} />
          <Route path="backgrounds" element={<BackgroundsTab />} />
          <Route path="settings" element={<SettingsTab />} />
          <Route path="rink-settings" element={<RinkSettingsTab />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
