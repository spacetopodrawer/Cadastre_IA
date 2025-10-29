import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AuthPage } from './components/Auth/AuthPage';
import { MainLayout } from './components/Layout/MainLayout';
import { FileManager } from './components/FileManager/FileManager';
import { PaintEditor } from './components/PaintEditor/PaintEditor';
import { AdminPanel } from './components/Admin/AdminPanel';

function App() {
  const { user, loading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/files" replace />} />
          <Route path="files" element={<FileManager />} />
          <Route path="editor/:fileId" element={<EditorWrapper />} />
          <Route path="admin" element={<AdminPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function EditorWrapper() {
  const fileId = window.location.pathname.split('/').pop();

  useEffect(() => {
    if (fileId) {
      import('./stores/fileStore').then(({ useFileStore }) => {
        useFileStore.getState().loadFile(fileId);
      });
    }
  }, [fileId]);

  return <PaintEditor fileId={fileId} />;
}

export default App;
