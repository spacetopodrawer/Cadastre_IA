<script lang="ts">
  import { syncStore } from '$lib/stores/syncStore';
  import { onMount } from 'svelte';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { BarChart, PieChart } from 'svelte-charts';
  import { Button } from '$components/ui/button';
  import { RefreshCw, FileText, CheckCircle, AlertCircle, Layers, FileSearch } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { ocrStore } from '$lib/stores/ocrStore';
  import { auditLog } from '$lib/stores/auditLog';

  export let className = '';
  
  let loading = true;
  let refreshInProgress = false;
  let stats = {
    total: 0,
    validated: 0,
    needsReview: 0,
    avgConfidence: 0,
    byType: {
      layer: 0,
      report: 0,
      document: 0,
      other: 0
    },
    confidenceDistribution: Array(10).fill(0) // 0-10%, 10-20%, ..., 90-100%
  };

  let ocrFiles = [];
  
  // Process files and update stats
  function processStats() {
    ocrFiles = $syncStore.filter(f => f.metadata?.ocr === true);
    
    const total = ocrFiles.length;
    const validated = ocrFiles.filter(f => f.metadata?.validated).length;
    const needsReview = ocrFiles.filter(f => f.metadata?.needsReview).length;
    
    // Calculate average confidence
    const totalConfidence = ocrFiles.reduce((sum, f) => {
      const conf = parseFloat(f.metadata?.confidence || '0');
      return isNaN(conf) ? sum : sum + conf;
    }, 0);
    
    // Calculate confidence distribution
    const confidenceDistribution = Array(10).fill(0);
    ocrFiles.forEach(file => {
      const conf = parseFloat(file.metadata?.confidence || '0');
      if (!isNaN(conf)) {
        const bucket = Math.min(Math.floor(conf * 10), 9);
        confidenceDistribution[bucket]++;
      }
    });
    
    stats = {
      total,
      validated,
      needsReview,
      avgConfidence: total > 0 ? Math.round((totalConfidence / total) * 100) / 100 : 0,
      byType: {
        layer: ocrFiles.filter(f => f.metadata?.classification === 'layer').length,
        report: ocrFiles.filter(f => f.metadata?.classification === 'report').length,
        document: ocrFiles.filter(f => f.metadata?.classification === 'document').length,
        other: ocrFiles.filter(f => !f.metadata?.classification || 
          !['layer', 'report', 'document'].includes(f.metadata.classification)).length
      },
      confidenceDistribution
    };
  }
  
  // Refresh data
  async function refreshData() {
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      await syncStore.refresh();
      processStats();
    } catch (error) {
      console.error('Error refreshing OCR dashboard:', error);
    } finally {
      refreshInProgress = false;
    }
  }
  
  // Navigate to file list filtered by type
  function filterByType(type: string) {
    goto(`/files?ocr=true&type=${type}`);
  }
  
  // Initialize
  onMount(() => {
    processStats();
    loading = false;
    
    // Subscribe to syncStore changes
    const unsubscribe = syncStore.subscribe(() => {
      processStats();
    });
    
    return () => unsubscribe();
  });
  
  // Chart data
  $: typeChartData = {
    labels: ['Layers', 'Reports', 'Documents', 'Others'],
    datasets: [
      {
        data: [
          stats.byType.layer,
          stats.byType.report,
          stats.byType.document,
          stats.byType.other
        ],
        backgroundColor: ['#4f46e5', '#10b981', '#3b82f6', '#9ca3af']
      }
    ]
  };
  
  $: confidenceChartData = {
    labels: ['0-10%', '10-20%', '20-30%', '30-40%', '40-50%', '50-60%', '60-70%', '70-80%', '80-90%', '90-100%'],
    datasets: [
      {
        label: 'Documents',
        data: stats.confidenceDistribution,
        backgroundColor: '#4f46e5'
      }
    ]
  };
</script>

<div class="dashboard-container {className}">
  <div class="dashboard-header">
    <h1 class="text-2xl font-bold">OCR Analytics Dashboard</h1>
    <Button 
      variant="outline" 
      on:click={refreshData}
      disabled={refreshInProgress}
    >
      <RefreshCw class={`w-4 h-4 mr-2 ${refreshInProgress ? 'animate-spin' : ''}`} />
      {refreshInProgress ? 'Refreshing...' : 'Refresh Data'}
    </Button>
  </div>
  
  {#if loading}
    <div class="flex justify-center items-center p-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  {:else}
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <!-- Total OCR Processed -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Total OCR Processed</CardTitle>
          <FileText class="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{stats.total}</div>
          <p class="text-xs text-muted-foreground">
            {stats.total > 0 ? `${Math.round((stats.validated / stats.total) * 100)}% validated` : 'No data'}
          </p>
        </CardContent>
      </Card>
      
      <!-- Validated -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Validated</CardTitle>
          <CheckCircle class="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{stats.validated}</div>
          <p class="text-xs text-muted-foreground">
            {stats.total > 0 ? `${Math.round((stats.validated / stats.total) * 100)}% of total` : 'No data'}
          </p>
        </CardContent>
      </Card>
      
      <!-- Needs Review -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Needs Review</CardTitle>
          <AlertCircle class="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{stats.needsReview}</div>
          <p class="text-xs text-muted-foreground">
            {stats.total > 0 ? `${Math.round((stats.needsReview / stats.total) * 100)}% of total` : 'No data'}
          </p>
        </CardContent>
      </Card>
      
      <!-- Average Confidence -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium">Avg. Confidence</CardTitle>
          <Layers class="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{stats.avgConfidence}%</div>
          <div class="mt-2">
            <Progress value={stats.avgConfidence} class="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
    
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Document Types -->
      <Card>
        <CardHeader>
          <CardTitle>Document Types</CardTitle>
          <CardDescription>Distribution of processed documents by type</CardDescription>
        </CardHeader>
        <CardContent class="h-[300px]">
          {#if stats.total > 0}
            <div class="grid grid-cols-2 gap-4">
              {#each Object.entries(stats.byType) as [type, count]}
                {#if count > 0}
                  <div 
                    class="flex flex-col items-center p-4 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                    on:click={() => filterByType(type === 'other' ? 'other' : type)}
                  >
                    <div class="text-2xl font-bold">{count}</div>
                    <div class="text-sm text-center capitalize">
                      {type === 'layer' ? 'Layers' : 
                       type === 'report' ? 'Reports' : 
                       type === 'document' ? 'Documents' : 'Others'}
                    </div>
                    <div class="text-xs text-muted-foreground mt-1">
                      {Math.round((count / stats.total) * 100)}%
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileSearch class="h-12 w-12 mb-2 opacity-30" />
              <p>No OCR data available</p>
            </div>
          {/if}
        </CardContent>
      </Card>
      
      <!-- Confidence Distribution -->
      <Card>
        <CardHeader>
          <CardTitle>Confidence Distribution</CardTitle>
          <CardDescription>Distribution of confidence scores across all documents</CardDescription>
        </CardHeader>
        <CardContent class="h-[300px]">
          {#if stats.total > 0}
            <BarChart
              data={confidenceChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      precision: 0
                    }
                  }
                }
              }}
            />
          {:else}
            <div class="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileSearch class="h-12 w-12 mb-2 opacity-30" />
              <p>No confidence data available</p>
            </div>
          {/if}
        </CardContent>
      </Card>
    </div>
    
    <!-- Recent Activity -->
    <Card>
      <CardHeader>
        <CardTitle>Recent OCR Activity</CardTitle>
        <CardDescription>Most recent OCR processing events</CardDescription>
      </CardHeader>
      <CardContent>
        {#if $auditLog.length > 0}
          <div class="space-y-4">
            {#each $auditLog.filter(log => log.type.startsWith('ocr_')).slice(0, 5) as log}
              <div class="flex items-start pb-4 border-b last:border-0 last:pb-0">
                <div class="flex-shrink-0 mr-3">
                  {#if log.type === 'ocr_started'}
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <RefreshCw class="h-4 w-4 text-blue-600" />
                    </div>
                  {:else if log.type === 'ocr_completed'}
                    <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle class="h-4 w-4 text-green-600" />
                    </div>
                  {:else if log.type === 'ocr_error'}
                    <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                      <AlertCircle class="h-4 w-4 text-red-600" />
                    </div>
                  {:else}
                    <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <FileText class="h-4 w-4 text-gray-600" />
                    </div>
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">
                    {log.type === 'ocr_started' ? 'OCR Started' : 
                     log.type === 'ocr_completed' ? 'OCR Completed' : 
                     log.type === 'ocr_error' ? 'OCR Error' : 'OCR Event'}
                  </p>
                  <p class="text-sm text-muted-foreground truncate">
                    {log.message}
                  </p>
                  <p class="text-xs text-muted-foreground mt-1">
                    {new Date(log.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-8 text-muted-foreground">
            <p>No recent OCR activity found</p>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}
</div>

<style>
  .dashboard-container {
    @apply space-y-6 p-4;
  }
  
  .dashboard-header {
    @apply flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between;
  }
  
  /* Responsive chart container */
  .chart-container {
    @apply h-[300px] w-full;
  }
  
  /* Card hover effect */
  .card-hover {
    @apply transition-shadow hover:shadow-md;
  }
  
  /* Status indicators */
  .status-badge {
    @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
  }
  
  .status-success {
    @apply bg-green-100 text-green-800;
  }
  
  .status-warning {
    @apply bg-yellow-100 text-yellow-800;
  }
  
  .status-error {
    @apply bg-red-100 text-red-800;
  }
  
  /* Responsive grid for smaller screens */
  @media (max-width: 640px) {
    .dashboard-container {
      @apply p-2;
    }
    
    .stat-card {
      @apply p-4;
    }
  }
</style>
