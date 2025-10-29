import { useState, useEffect } from 'react';
import { Users, Shield, Smartphone, Monitor, Server } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  devices: Device[];
  behavior: {
    character: string;
    prompts: string[];
  };
}

interface Device {
  id: string;
  name: string;
  type: string;
  isOnline: boolean;
  lastSeen: string;
  ipAddress: string;
}

export function RoleManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    // Appel API pour récupérer tous les utilisateurs
    const response = await fetch('/api/admin/users');
    const data = await response.json();
    setUsers(data.users);
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'SERVER':
        return <Server className="w-5 h-5" />;
      case 'PC':
        return <Monitor className="w-5 h-5" />;
      case 'MOBILE':
      case 'TABLET':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-800';
      case 'USER':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="w-8 h-8" /> Gestion des Rôles et Privilèges
        </h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + Nouvel Utilisateur
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des utilisateurs */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" /> Utilisateurs ({users.length})
            </h2>
          </div>
          <div className="divide-y">
            {users.map(user => (
              <div
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`p-4 hover:bg-gray-50 cursor-pointer ${
                  selectedUser?.id === user.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{user.name}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.devices.map(device => (
                      <div
                        key={device.id}
                        className={`flex items-center gap-1 px-2 py-1 rounded ${
                          device.isOnline ? 'bg-green-100' : 'bg-gray-100'
                        }`}
                        title={`${device.name} - ${
                          device.isOnline ? 'En ligne' : 'Hors ligne'
                        }`}
                      >
                        {getDeviceIcon(device.type)}
                        <span
                          className={`w-2 h-2 rounded-full ${
                            device.isOnline ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Détails utilisateur sélectionné */}
        {selectedUser && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold">Détails</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Profil Comportemental</h3>
                <p className="text-sm text-gray-600">
                  {selectedUser.behavior.character}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Prompts Assignés</h3>
                <ul className="space-y-1">
                  {selectedUser.behavior.prompts.map((prompt, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-gray-600 flex items-start gap-2"
                    >
                      <span className="text-blue-500">•</span>
                      {prompt}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Devices</h3>
                <div className="space-y-2">
                  {selectedUser.devices.map(device => (
                    <div key={device.id} className="p-2 border rounded">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getDeviceIcon(device.type)}
                          <span className="text-sm font-medium">
                            {device.name}
                          </span>
                        </div>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            device.isOnline ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        IP: {device.ipAddress}
                      </div>
                      <div className="text-xs text-gray-500">
                        Dernière activité:{' '}
                        {new Date(device.lastSeen).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                  Modifier le Rôle
                </button>
                <button className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                  Désactiver
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
