import { useState, useEffect } from 'react';
import { Filter, Download, Search } from 'lucide-react';

interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export function AuditLog() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState({
    user: '',
    action: '',
    dateFrom: '',
    dateTo: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/admin/audit', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('cadastre_token')}`
        }
      });
      const data = await response.json();
      setLogs(data.logs);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement logs:', error);
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const csv = [
      ['Timestamp', 'User', 'Role', 'Action', 'Resource', 'Details', 'IP'],
      ...filteredLogs.map(log => [
        log.timestamp,
        log.userName,
        log.userRole,
        log.action,
        log.resource,
        log.details,
        log.ipAddress
      ])
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString()}.csv`;
    a.click();
  };

  const filteredLogs = logs.filter(log => {
    if (filter.user && !log.userName.toLowerCase().includes(filter.user.toLowerCase())) return false;
    if (filter.action && log.action !== filter.action) return false;
    if (filter.dateFrom && new Date(log.timestamp) < new Date(filter.dateFrom)) return false;
    if (filter.dateTo && new Date(log.timestamp) > new Date(filter.dateTo)) return false;
    return true;
  });

  const actionColors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    LOGIN: 'bg-purple-100 text-purple-800',
    SYNC: 'bg-orange-100 text-orange-800'
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Journal d'Audit</h1>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <span className="font-semibold">Filtres</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Utilisateur</label>
            <input
              type="text"
              placeholder="Rechercher..."
              value={filter.user}
              onChange={(e) => setFilter({ ...filter, user: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={filter.action}
              onChange={(e) => setFilter({ ...filter, action: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">Toutes</option>
              <option value="CREATE">Création</option>
              <option value="UPDATE">Modification</option>
              <option value="DELETE">Suppression</option>
              <option value="LOGIN">Connexion</option>
              <option value="SYNC">Synchronisation</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
            <input
              type="date"
              value={filter.dateTo}
              onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Chargement...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ressource</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Détails</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{log.userName}</div>
                    <div className="text-xs text-gray-500">{log.userRole}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${actionColors[log.action] || 'bg-gray-100'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">{log.resource}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{log.details}</td>
                  <td className="px-6 py-4 text-sm font-mono">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLogs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Aucun log correspondant aux filtres
            </div>
          )}
        </div>
      )}
    </div>
  );
}
