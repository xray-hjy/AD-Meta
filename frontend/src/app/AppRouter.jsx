import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/home/HomePage';

const AbundanceWorkspacePage = lazy(() => import('../pages/abundance/AbundanceWorkspacePage'));

export default function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route index element={<HomePage />} />
        <Route
          path="analysis/abundance"
          element={
            <Suspense fallback={<div className="route-loading">正在打开分析工作区...</div>}>
              <AbundanceWorkspacePage />
            </Suspense>
          }
        />
        <Route path="analysis" element={<Navigate to="/analysis/abundance" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
