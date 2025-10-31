import React, { useState, useEffect, useCallback } from 'react';
import { ocrCorrectionMemory, type CorrectionEntry, type CorrectionFilter } from '$lib/ocr/OCRCorrectionMemory';
import { Download, Upload, Search, Filter, X, Check, Trash2, Edit, RotateCcw, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const CorrectionAdminPanel: React.FC = () => {
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CorrectionFilter>({ source: 'all' });
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CorrectionEntry>>({});
  const [stats, setStats] = useState({
    total: 0,
    bySource: { user: 0, agent: 0, external: 0, history: 0 },
    averageConfidence: 0,
  });

  // Load corrections and stats
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [corrections, stats] = await Promise.all([
        ocrCorrectionMemory.getCorrections({ ...filter, searchTerm }),
        ocrCorrectionMemory.getStats(),
      ]);
      setCorrections(corrections);
      setStats(stats);
    } catch (error) {
      console.error('Error loading corrections:', error);
      toast.error('Erreur lors du chargement des corrections');
    } finally {
      setLoading(false);
    }
  }, [filter, searchTerm]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle filter change
  const handleFilterChange = (newFilter: Partial<CorrectionFilter>) => {
    setFilter(prev => ({ ...prev, ...newFilter }));
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Handle delete correction
  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette correction ?')) return;
    
    try {
      const success = await ocrCorrectionMemory.deleteCorrection(id);
      if (success) {
        toast.success('Correction supprimée avec succès');
        await loadData();
      } else {
        throw new Error('Échec de la suppression');
      }
    } catch (error) {
      console.error('Error deleting correction:', error);
      toast.error('Erreur lors de la suppression de la correction');
    }
  };

  // Handle start editing
  const startEditing = (correction: CorrectionEntry) => {
    setEditingId(correction.id);
    setEditForm({
      original: correction.original,
      corrected: correction.corrected,
      source: correction.source,
      confidence: correction.confidence,
      context: correction.context,
    });
  };

  // Handle save edit
  const saveEdit = async () => {
    if (!editingId) return;
    
    try {
      await ocrCorrectionMemory.updateCorrection(editingId, {
        ...editForm,
        updatedAt: new Date().toISOString(),
      });
      
      toast.success('Correction mise à jour avec succès');
      setEditingId(null);
      await loadData();
    } catch (error) {
      console.error('Error updating correction:', error);
      toast.error('Erreur lors de la mise à jour de la correction');
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const data = await ocrCorrectionMemory.exportCorrections();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocr_corrections_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Export réussi');
    } catch (error) {
      console.error('Error exporting corrections:', error);
      toast.error('Erreur lors de l\'export des corrections');
    }
  };

  // Handle import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const result = await ocrCorrectionMemory.importCorrections(content);
          
          if (result.success) {
            toast.success(`Import réussi: ${result.count} corrections importées`);
          } else {
            toast.error(
              `Import partiel: ${result.count} corrections importées, ${result.errors.length} erreurs`,
              { duration: 5000 }
            );
          }
          
          await loadData();
        } catch (error) {
          console.error('Error processing import:', error);
          toast.error('Erreur lors du traitement du fichier d\'import');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error importing corrections:', error);
      toast.error('Erreur lors de l\'import des corrections');
    }
    
    // Reset the input to allow re-uploading the same file
    e.target.value = '';
  };

  // Format confidence to percentage
  const formatConfidence = (confidence: number) => {
    return Math.round(confidence * 100) + '%';
  };

  // Format date
  const formatDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { 
      addSuffix: true, 
      locale: fr 
    });
  };

  // Get source label
  const getSourceLabel = (source: string) => {
    const sources = {
      user: 'Utilisateur',
      agent: 'Agent IA',
      external: 'Externe',
      history: 'Historique',
    };
    return sources[source as keyof typeof sources] || source;
  };

  // Get source color
  const getSourceColor = (source: string) => {
    const colors = {
      user: 'bg-blue-100 text-blue-800',
      agent: 'bg-purple-100 text-purple-800',
      external: 'bg-yellow-100 text-yellow-800',
      history: 'bg-gray-100 text-gray-800',
    };
    return colors[source as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Gestion des corrections OCR</h1>
          <p className="text-gray-600">
            Visualisez et gérez les corrections de texte OCR enregistrées
          </p>
        </div>
        <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <label className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            Importer
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-500">Corrections</div>
        </div>
        {Object.entries(stats.bySource).map(([source, count]) => (
          <div key={source} className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-sm text-gray-500">{getSourceLabel(source)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Rechercher des corrections..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={filter.source}
              onChange={(e) => handleFilterChange({ source: e.target.value as any })}
            >
              <option value="all">Toutes les sources</option>
              <option value="user">Utilisateur</option>
              <option value="agent">Agent IA</option>
              <option value="external">Externe</option>
              <option value="history">Historique</option>
            </select>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => {
                setFilter({ source: 'all' });
                setSearchTerm('');
              }}
              title="Réinitialiser les filtres"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Corrections Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">Chargement des corrections...</p>
          </div>
        ) : corrections.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p>Aucune correction trouvée</p>
            <p className="text-sm mt-1">Essayez de modifier vos filtres de recherche</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Original
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Correction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Confiance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dernière mise à jour
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {corrections.map((correction) => (
                  <tr key={correction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {editingId === correction.id ? (
                        <input
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          value={editForm.original || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, original: e.target.value })
                          }
                        />
                      ) : (
                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded">
                          {correction.original}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {editingId === correction.id ? (
                        <input
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          value={editForm.corrected || ''}
                          onChange={(e) =>
                            setEditForm({ ...editForm, corrected: e.target.value })
                          }
                        />
                      ) : (
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">
                          {correction.corrected}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingId === correction.id ? (
                        <select
                          className="border rounded px-2 py-1"
                          value={editForm.source}
                          onChange={(e) =>
                            setEditForm({ ...editForm, source: e.target.value as any })
                          }
                        >
                          <option value="user">Utilisateur</option>
                          <option value="agent">Agent IA</option>
                          <option value="external">Externe</option>
                          <option value="history">Historique</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSourceColor(
                            correction.source
                          )}`}
                        >
                          {getSourceLabel(correction.source)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingId === correction.id ? (
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          className="border rounded px-2 py-1 w-20"
                          value={editForm.confidence}
                          onChange={(e) =>
                            setEditForm({ ...editForm, confidence: parseFloat(e.target.value) })
                          }
                        />
                      ) : (
                        <div className="w-24 bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${correction.confidence * 100}%` }}
                          ></div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(correction.updatedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingId === correction.id ? (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={saveEdit}
                            className="text-green-600 hover:text-green-900"
                            title="Enregistrer"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-500 hover:text-gray-700"
                            title="Annuler"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => startEditing(correction)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(correction.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context Help */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Comment utiliser ce panneau</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p className="mb-2">
                Ce panneau vous permet de gérer les corrections de texte OCR enregistrées dans le système.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Utilisez la barre de recherche pour trouver des corrections spécifiques</li>
                <li>Filtrez par source pour voir les corrections provenant d'utilisateurs, d'agents IA, etc.</li>
                <li>Exportez les corrections au format JSON pour sauvegarder ou partager</li>
                <li>Importez des corrections à partir d'un fichier JSON</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CorrectionAdminPanel;
