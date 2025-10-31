import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { RefreshCw, AlertCircle, CheckCircle, WifiOff, FileText, Users, Settings } from 'lucide-react';

import { syncStore } from '../SyncManager/SyncManager.svelte';
import type { SyncStatus, SyncedFile } from '../../stores/syncStore';
import { useEffect, useState } from 'react';

export function AdminPanel() {
  const [syncedFiles, setSyncedFiles] = useState<SyncedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<SyncedFile | null>(null);

  // S'abonner aux mises à jour du store
  useEffect(() => {
    const unsubscribe = syncStore.subscribe(($syncStore) => {
      setSyncedFiles([...$syncStore]);
    });

    // Chargement initial
    setSyncedFiles(syncStore.get());

    return () => unsubscribe();
  }, []);

  // Récupérer les fichiers avec des conflits
  const conflictedFiles = syncedFiles.filter(file => file.status === 'conflict');
  // Récupérer les fichiers récemment modifiés (dernières 24h)
  const recentlyModified = syncedFiles
    .filter(file => {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      return file.lastSynced && new Date(file.lastSynced) > oneDayAgo;
    })
    .sort((a, b) => 
      (b.lastSynced?.getTime() || 0) - (a.lastSynced?.getTime() || 0)
    );

  const handleResolveConflict = (fileId: string) => {
    syncStore.resolveConflict(fileId, 'merge');
  };

  const handleForceSync = (fileId: string) => {
    syncStore.syncFile(fileId);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tableau de bord d'administration</h2>
        <Button variant="outline" size="sm" onClick={() => syncStore.syncAll()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tout synchroniser
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <FileText className="mr-2 h-4 w-4" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertCircle className="mr-2 h-4 w-4" />
            Conflits
            {conflictedFiles.length > 0 && (
              <span className="ml-2 rounded-full bg-red-500 text-white text-xs px-2 py-0.5">
                {conflictedFiles.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fichiers synchronisés</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{syncedFiles.length}</div>
                <p className="text-xs text-muted-foreground">
                  {syncedFiles.filter(f => f.status === 'synced').length} à jour
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conflits</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{conflictedFiles.length}</div>
                <p className="text-xs text-muted-foreground">
                  {conflictedFiles.length > 0 ? 'Nécessite une action' : 'Aucun conflit'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              {recentlyModified.length > 0 ? (
                <div className="space-y-4">
                  {recentlyModified.map((file) => (
                    <div 
                      key={file.id} 
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Dernière modification: {file.lastSynced?.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedFile(file)}
                        >
                          Voir l'audit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  Aucune activité récente
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle>Résolution des conflits</CardTitle>
            </CardHeader>
            <CardContent>
              {conflictedFiles.length > 0 ? (
                <div className="space-y-4">
                  {conflictedFiles.map((file) => (
                    <div key={file.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{file.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Dernière tentative: {file.lastSynced?.toLocaleString()}
                          </p>
                          <p className="text-sm text-red-500 mt-1">
                            {file.audit[file.audit.length - 1]?.split(': ')[1]}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleResolveConflict(file.id)}
                          >
                            Résoudre
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleForceSync(file.id)}
                          >
                            Forcer la synchronisation
                          </Button>
                        </div>
                      </div>
                      
                      <div className="bg-muted/50 p-3 rounded text-sm">
                        <h5 className="font-medium mb-2">Journal des modifications</h5>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {[...file.audit].reverse().map((entry, i) => (
                            <div key={i} className="text-xs">
                              {entry}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">Aucun conflit détecté</h3>
                  <p className="text-muted-foreground mt-1">
                    Tous les fichiers sont synchronisés avec le serveur.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Gestion des utilisateurs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Gestion des utilisateurs et des permissions (à implémenter).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres de synchronisation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Synchronisation automatique</h4>
                    <p className="text-sm text-muted-foreground">
                      Active la synchronisation automatique des fichiers
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Activer
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Intervalle de synchronisation</h4>
                    <p className="text-sm text-muted-foreground">
                      Fréquence de synchronisation automatique
                    </p>
                  </div>
                  <select className="bg-background border rounded-md px-3 py-1.5 text-sm">
                    <option>5 minutes</option>
                    <option>15 minutes</option>
                    <option>1 heure</option>
                    <option>6 heures</option>
                  </select>
                </div>
                
                <div className="pt-4 border-t">
                  <Button variant="destructive" size="sm">
                    Réinitialiser les paramètres
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AdminPanel;
