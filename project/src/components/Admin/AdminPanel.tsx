import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Users, Shield, FileImage, KeyRound, FileText, BarChart2, FileCheck, ListChecks } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Database } from '../../lib/database.types';
import { RoleManagement } from './RoleManagement';
import { lazy, Suspense } from 'react';

// Lazy load components
const OCRDashboard = lazy(() => import('../OCR/OCRDashboard').then(module => ({ default: module.OCRDashboard })));
const CorrectionAdminPanel = lazy(() => import('../OCR/CorrectionAdminPanel').then(module => ({ default: module.default })));

type AdminTab = 'dashboard' | 'ocr' | 'corrections' | 'roles';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function AdminPanel() {
  const { user: authUser } = useAuthStore();
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalFiles: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: AdminTab }>();
  const isRoleManagement = location.pathname.includes('roles');
  const isAdmin = authUser?.role === 'ADMIN' || authUser?.role === 'SUPER_ADMIN';
  const isSuperAdmin = authUser?.role === 'SUPER_ADMIN';

  // Set default tab if none is selected
  useEffect(() => {
    if (!tab && !isRoleManagement) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [tab, isRoleManagement, navigate]);

  useEffect(() => {
    if (isAdmin) {
      if (!isRoleManagement) {
        fetchUsers();
        fetchStats();
      }
    } else {
      navigate('/');
    }
  }, [isAdmin, isRoleManagement, navigate]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: fileCount } = await supabase
        .from('files')
        .select('*', { count: 'exact', head: true });

      const { count: adminCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'ADMIN');

      setStats({
        totalUsers: userCount || 0,
        totalFiles: fileCount || 0,
        admins: adminCount || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center p-8 bg-white rounded-xl shadow-md">
          <Shield className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Accès refusé</h2>
          <p className="text-gray-600">
            Vous devez être administrateur pour accéder à cette page
          </p>
        </div>
      </div>
    );
  }

  if (isRoleManagement) {
    return <RoleManagement />;
  }

  const renderTabContent = () => {
    switch (tab) {
      case 'ocr':
        return (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          }>
            <OCRDashboard />
          </Suspense>
        );
      case 'corrections':
        return (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          }>
            <CorrectionAdminPanel />
          </Suspense>
        );
      case 'roles':
        return <RoleManagement />;
      case 'dashboard':
      default:
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Utilisateurs</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Fichiers</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.totalFiles}</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileImage className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Administrateurs</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.admins}</p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Shield className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Utilisateurs récents</h2>
              </div>

              {loading ? (
                <div className="p-6 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                  <p className="mt-2 text-gray-600">Chargement des utilisateurs...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nom
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rôle
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Inscrit le
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.slice(0, 5).map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-600 font-medium">
                                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                                </span>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {user.full_name || 'Utilisateur sans nom'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold mb-2">Tableau de bord d'administration</h1>
          <p className="text-gray-600">
            Gestion des utilisateurs et des paramètres système
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isSuperAdmin && (
            <button
              onClick={() => navigate('/admin/roles')}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 transition-colors"
            >
              <KeyRound className="w-5 h-5" />
              Gérer les rôles
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className={`${tab === 'dashboard' || !tab
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" />
              Tableau de bord
            </div>
          </button>

          <button
            onClick={() => navigate('/admin/ocr')}
            className={`${tab === 'ocr'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              OCR
            </div>
          </button>

          <button
            onClick={() => navigate('/admin/corrections')}
            className={`${tab === 'corrections'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4" />
              Corrections OCR
            </div>
          </button>
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {renderTabContent()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Utilisateurs</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Fichiers</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalFiles}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FileImage className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Administrateurs</p>
              <p className="text-3xl font-bold text-gray-900">{stats.admins}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Utilisateurs récents</h2>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Chargement des utilisateurs...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nom
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rôle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inscrit le
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-600 font-medium">
                            {user.full_name?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.full_name || 'Utilisateur sans nom'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          // Implémenter la logique de modification du rôle
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => {
                          // Implémenter la logique de suppression
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
