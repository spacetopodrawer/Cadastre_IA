import { useEffect, useState, useCallback, useMemo } from 'react';
import { useFileStore } from '$stores/fileStore';
import { Plus, FileImage, Trash2, Clock, RefreshCw, AlertCircle, CheckCircle, WifiOff, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { syncStore, type SyncStatus, type SyncedFile } from '$components/SyncManager';
import { Button } from '$components/ui/button';
import { cn } from '$lib/utils';

// Composant pour afficher l'icône de statut
function SyncStatusIcon({ status, className = '' }: { status: SyncStatus; className?: string }) {
  const iconProps = { className: cn('w-4 h-4', className) };
  
  const icons = {
    synced: <CheckCircle {...iconProps} className={cn(iconProps.className, 'text-green-500')} />,
    pending: <RefreshCw {...iconProps} className={cn(iconProps.className, 'text-yellow-500 animate-spin')} />,
    conflict: <AlertCircle {...iconProps} className={cn(iconProps.className, 'text-red-500')} />,
    offline: <WifiOff {...iconProps} className={cn(iconProps.className, 'text-gray-400')} />,
  };

  return icons[status] || null;
}

export function FileManager() {
  const navigate = useNavigate();
  const { files, loading, fetchFiles, createFile, deleteFile } = useFileStore();
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showSyncPanel, setShowSyncPanel] = useState(true);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncedFile>>({});

  // Mettre à jour le statut local quand le store change
  useEffect(() => {
    const unsubscribe = syncStore.subscribe(($syncStore) => {
      const statusMap = $syncStore.reduce((acc, file) => {
        acc[file.id] = file;
        return acc;
      }, {} as Record<string, SyncedFile>);
      setSyncStatus(statusMap);
    });

    return () => unsubscribe();
  }, []);

  // Ajouter les fichiers au suivi de synchronisation
  useEffect(() => {
    if (!files.length) return;

    files.forEach(file => {
      // Ne pas réinitialiser le statut s'il existe déjà
      if (!syncStore.get().some(f => f.id === file.id)) {
        syncStore.addFile({
          id: file.id,
          name: file.name,
          type: 'document',
          status: 'synced',
          lastSynced: new Date(file.updatedAt),
          metadata: {
            path: file.path,
            size: file.size,
            type: file.type
          }
        });
      }
    });
  }, [files]);

  // Fonction pour forcer la synchronisation d'un fichier
  const handleSyncFile = useCallback(async (fileId: string) => {
    try {
      syncStore.updateStatus(fileId, 'pending', 'Synchronisation en cours...');
      
      // Simulation de la synchronisation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mettre à jour avec les données du serveur
      const file = files.find(f => f.id === fileId);
      if (file) {
        syncStore.updateStatus(fileId, 'synced', 'Synchronisation réussie', {
          lastModified: new Date(file.updatedAt),
          size: file.size
        });
      }
    } catch (error) {
      syncStore.updateStatus(fileId, 'conflict', 'Erreur de synchronisation');
      console.error('Erreur lors de la synchronisation:', error);
      console.error('Erreur de synchronisation:', error);
      syncStore.updateStatus(fileId, 'conflict', 'Erreur de synchronisation');
    }
  }, []);

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    try {
      const file = await createFile(newFileName, { objects: [], version: '5.3.0' });
      setShowNewFileDialog(false);
      setNewFileName('');
      
      // Ajouter le nouveau fichier au suivi de synchronisation
      syncStore.addFile({
        id: file.id,
        name: file.name,
        type: 'document',
        status: 'synced',
        lastModified: new Date(file.updatedAt)
      });
      
      navigate(`/editor/${file.id}`);
    } catch (error) {
      console.error('Error creating file:', error);
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${name}" ?`)) {
      try {
        await deleteFile(id);
        // Retirer le fichier du suivi de synchronisation
        syncStore.removeFile(id);
      } catch (error) {
        console.error('Error deleting file:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestionnaire de fichiers</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-md transition-colors"
          >
            <RefreshCw size={16} />
            {showSyncPanel ? 'Masquer la synchronisation' : 'Afficher la synchronisation'}
          </button>
          <button
            onClick={() => setShowNewFileDialog(true)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
          >
            <Plus size={16} />
            Nouveau fichier
          </button>
        </div>
      </div>

      {/* Panneau de synchronisation */}
      {showSyncPanel && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Synchronisation des fichiers</h2>
          <SyncManager showOnly="all" showActions={true} />
        </div>
      )}

      {/* Liste des fichiers */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium">Mes fichiers</h2>
        </div>
        
        {files.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>Aucun fichier trouvé. Créez votre premier fichier pour commencer.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {files.map((file) => (
              <li key={file.id} className="hover:bg-gray-50 transition-colors">
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <FileImage className="text-blue-500" size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{file.name}</span>
                        <SyncStatusIcon status={syncStore.getFileStatus(file.id) || 'synced'} />
                      </div>
                      <div className="text-sm text-gray-500">
                        Modifié le {formatDate(file.updatedAt)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSyncFile(file.id)}
                        className="text-gray-500 hover:text-blue-500 transition-colors"
                        title="Synchroniser"
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        onClick={() => navigate(`/editor/${file.id}`)}
                        className="text-blue-500 hover:text-blue-700"
                        title="Ouvrir"
                      >
                        Ouvrir
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id, file.name)}
                        className="text-red-500 hover:text-red-700"
                        title="Supprimer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Boîte de dialogue de création de fichier */}
      {showNewFileDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Nouveau fichier</h2>
            <form onSubmit={handleCreateFile}>
              <div className="mb-4">
                <label htmlFor="fileName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du fichier
                </label>
                <input
                  type="text"
                  id="fileName"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Entrez un nom de fichier"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewFileDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
