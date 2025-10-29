import { useAuthStore } from '../../stores/authStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Palette, Home, Shield, LogOut, User } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Cadastre_IA</span>
            </div>

            <nav className="flex items-center gap-1">
              <button
                onClick={() => navigate('/files')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive('/files')
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Home className="w-4 h-4" />
                Mes fichiers
              </button>

              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive('/admin')
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Administration
                </button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
              <User className="w-4 h-4 text-gray-600" />
              <div className="text-sm">
                <div className="font-medium text-gray-900">{user?.name}</div>
                <div className="text-xs text-gray-500">{user?.role}</div>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
