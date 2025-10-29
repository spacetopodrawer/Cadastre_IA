import { useEffect, useState } from 'react';
import { useFileStore } from '../../stores/fileStore';
import { Plus, FileImage, Trash2, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function FileManager() {
  const navigate = useNavigate();
  const { files, loading, fetchFiles, createFile, deleteFile } = useFileStore();
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    try {
      const file = await createFile(newFileName, { objects: [], version: '5.3.0' });
      setShowNewFileDialog(false);
      setNewFileName('');
      navigate(`/editor/${file.id}`);
    } catch (error) {
      console.error('Error creating file:', error);
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${name}" ?`)) {
      try {
        await deleteFile(id);
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

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Chargement des fichiers...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Mes Dessins</h1>
            <p className="text-gray-600 mt-1">
              {files.length} {files.length <= 1 ? 'fichier' : 'fichiers'}
            </p>
          </div>
          <button
            onClick={() => setShowNewFileDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nouveau dessin
          </button>
        </div>

        {files.length === 0 ? (
          <div className="text-center py-16">
            <FileImage className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Aucun dessin pour le moment
            </h3>
            <p className="text-gray-600 mb-6">
              Commencez par créer votre premier dessin
            </p>
            <button
              onClick={() => setShowNewFileDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Créer un dessin
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {files.map((file) => (
              <div
                key={file.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
              >
                <div
                  onClick={() => navigate(`/editor/${file.id}`)}
                  className="aspect-video bg-gray-100 flex items-center justify-center relative overflow-hidden"
                >
                  {file.thumbnail ? (
                    <img
                      src={file.thumbnail}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileImage className="w-12 h-12 text-gray-400" />
                  )}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all" />
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 truncate mb-1">
                    {file.name}
                  </h3>
                  <div className="flex items-center text-xs text-gray-500 mb-3">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDate(file.updated_at)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/editor/${file.id}`);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                    >
                      Ouvrir
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(file.id, file.name);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewFileDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Nouveau dessin
            </h2>
            <form onSubmit={handleCreateFile}>
              <div className="mb-4">
                <label
                  htmlFor="fileName"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Nom du fichier
                </label>
                <input
                  id="fileName"
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Mon dessin"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFileDialog(false);
                    setNewFileName('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
