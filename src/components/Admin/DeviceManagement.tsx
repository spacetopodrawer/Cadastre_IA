import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Server, Tablet, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  type: 'SERVER' | 'PC' | 'MOBILE' | 'TABLET';
  userId: string;
  userName: string;
  userRole: string;
  ipAddress: string;
  isOnline: boolean;
  isApproved: boolean;
  requiresValidation: boolean;
  registeredAt: string;
  lastSeenAt: string;
}

export function DeviceManagement() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'online' | 'offline'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000); // Refresh toutes les 10s
    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/admin/devices', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('cadastre_token')}`
        }
      });
      const data = await response.json();
      setDevices(data.devices);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement devices:', error);
      setLoading(false);
    }
  };

  const approveDevice = async (deviceId: string) => {
    try {
      await fetch('/api/admin/approve-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('cadastre_token')}`
        },
        body: JSON.stringify({ deviceId, approve: true })
      });
      fetchDevices();
    } catch (error) {
      console.error('Erreur approbation device:', error);
    }
  };

  const removeDevice = async (deviceId: string) => {
    if (!confirm('Supprimer ce device définitivement ?')) return;
    try {
      await fetch(`/api/admin/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('cadastre_token')}`
        }
      });
      fetchDevices();
    } catch (error) {
      console.error('Erreur suppression device:', error);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'SERVER':
        return <Server className="w-5 h-5 text-purple-600" />;
      case 'PC':
        return <Monitor className="w-5 h-5 text-blue-600" />;
      case 'MOBILE':
        return <Smartphone className="w-5 h-5 text-green-600" />;
      case 'TABLET':
        return <Tablet className="w-5 h-5 text-orange-600" />;
      default:
        return <Monitor className="w-5 h-5 text-gray-600" />;
    }
  };

  const filteredDevices = devices.filter(device => {
    if (filter === 'pending') return !device.isApproved && device.requiresValidation;
    if (filter === 'online') return device.isOnline;
    if (filter === 'offline') return !device.isOnline;
    return true;
  });

  const pendingCount = devices.filter(d => !d.isApproved && d.requiresValidation).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Gestion des Devices</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Tous ({devices.length})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded ${filter === 'pending' ? 'bg-orange-600 text-white' : 'bg-gray-200'}`}
          >
            En attente ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-4 py-2 rounded ${filter === 'online' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
          >
            En ligne
          </button>
          <button
            onClick={() => setFilter('offline')}
            className={`px-4 py-2 rounded ${filter === 'offline' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Hors ligne
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Chargement...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDevices.map(device => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {getDeviceIcon(device.type)}
                      <div>
                        <div className="font-medium">{device.name}</div>
                        <div className="text-xs text-gray-500">
                          Enregistré: {new Date(device.registeredAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{device.userName}</div>
                    <div className="text-xs text-gray-500">{device.userRole}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">{device.type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono">{device.ipAddress}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {device.isOnline ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <span className="text-sm">
                        {device.isOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </div>
                    {!device.isApproved && device.requiresValidation && (
                      <div className="flex items-center gap-1 text-orange-600 text-xs mt-1">
                        <Clock className="w-4 h-4" /> En attente d'approbation
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {!device.isApproved && device.requiresValidation && (
                        <button
                          onClick={() => approveDevice(device.id)}
                          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Approuver
                        </button>
                      )}
                      <button
                        onClick={() => removeDevice(device.id)}
                        className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
