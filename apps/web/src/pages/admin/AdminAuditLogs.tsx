import React, { useMemo, useState } from 'react';
import {
  Shield,
  Search,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { auditApi, type AuditLogRow, type AuditExportListItem } from '../../api/auditApi';
import { Can } from '../../hooks/usePermissions';

function dateRangeToIso(range: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  const days =
    range === '1d'
      ? 1
      : range === '7d'
        ? 7
        : range === '30d'
          ? 30
          : range === '90d'
            ? 90
            : 7;
  start.setTime(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export function AdminAuditLogs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedResource, setSelectedResource] = useState('all');
  const [dateRange, setDateRange] = useState('7d');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 20;

  const { startDate, endDate } = useMemo(() => dateRangeToIso(dateRange), [dateRange]);

  const { data: filterOptions } = useQuery({
    queryKey: ['audit', 'filter-options'],
    queryFn: () => auditApi.getFilterOptions(),
    enabled: !!user,
  });

  const statDays =
    dateRange === '1d' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;

  const { data: statsData } = useQuery({
    queryKey: ['audit', 'stats', statDays],
    queryFn: () => auditApi.getStats(statDays),
    enabled: !!user,
  });

  const { data: auditLogsData, isLoading: logsLoading } = useQuery({
    queryKey: ['audit', 'logs', page, selectedAction, selectedResource, dateRange],
    queryFn: () =>
      auditApi.queryLogs({
        page,
        limit,
        actionTypes: selectedAction === 'all' ? undefined : selectedAction,
        resourceTypes: selectedResource === 'all' ? undefined : selectedResource,
        startDate,
        endDate,
      }),
    enabled: !!user,
  });

  const { data: exportsList, isLoading: exportsLoading } = useQuery({
    queryKey: ['audit', 'exports', 'list'],
    queryFn: () => auditApi.listExports({ limit: 10, offset: 0 }),
    enabled: !!user,
  });

  const requestExport = useMutation({
    mutationFn: (format: 'json' | 'csv') =>
      auditApi.createExport({
        startDate,
        endDate,
        format,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit', 'exports', 'list'] });
    },
  });

  const total = auditLogsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filteredLogs = useMemo(() => {
    const auditLogs: AuditLogRow[] = auditLogsData?.logs || [];
    const q = searchTerm.toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (log) =>
        log.actionType.toLowerCase().includes(q) ||
        log.resourceType.toLowerCase().includes(q) ||
        (log.resourceId && log.resourceId.toLowerCase().includes(q)) ||
        (log.userId && log.userId.toLowerCase().includes(q)),
    );
  }, [auditLogsData?.logs, searchTerm]);

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-purple-100 text-purple-800';
      case 'logout':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionIcon = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('create')) return CheckCircle;
    if (a.includes('update')) return Activity;
    if (a.includes('delete')) return XCircle;
    if (a.includes('login') || a.includes('logout')) return User;
    return AlertCircle;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const detailsPreview = (log: AuditLogRow) => {
    if (log.metadata && typeof log.metadata === 'object') {
      try {
        return JSON.stringify(log.metadata).slice(0, 120);
      } catch {
        return '—';
      }
    }
    return '—';
  };

  const actionTypes = filterOptions?.actionTypes?.length
    ? filterOptions.actionTypes
    : ['create', 'update', 'delete', 'login', 'logout'];
  const resourceTypes = filterOptions?.resourceTypes ?? [];

  async function downloadExportFile(exp: AuditExportListItem) {
    if (exp.status !== 'completed') return;
    const blob = await auditApi.downloadExportBlob(exp.id);
    const ext = exp.format === 'csv' ? 'csv' : 'json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-export-${exp.id.slice(0, 8)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600 mt-1">Monitor system activities and user actions</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">Total events (period)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {(statsData?.totalEvents ?? total).toLocaleString()}
              </p>
            </div>
            <Shield className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">On this page</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{filteredLogs.length}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">Unique users (page)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {new Set(filteredLogs.map((l) => l.userId).filter(Boolean)).size}
              </p>
            </div>
            <User className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">Top action (period)</p>
              <p className="text-sm font-bold text-gray-900 mt-1 truncate">
                {statsData?.eventsByAction?.[0]?.actionType ?? '—'}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      <Can permission="audit.logs.export">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exports
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={requestExport.isPending}
                onClick={() => requestExport.mutate('json')}
                className="inline-flex items-center px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {requestExport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Request JSON'}
              </button>
              <button
                type="button"
                disabled={requestExport.isPending}
                onClick={() => requestExport.mutate('csv')}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Request CSV
              </button>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['audit', 'exports', 'list'] })}
                className="inline-flex items-center px-3 py-2 text-gray-700 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh list
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Uses the current date range ({dateRange}). Exports are generated asynchronously; refresh the list until
            status is completed, then download.
          </p>
          {requestExport.isError && (
            <p className="text-sm text-red-600">{(requestExport.error as Error).message}</p>
          )}
          {exportsLoading ? (
            <p className="text-sm text-gray-500">Loading exports…</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">Created</th>
                    <th className="text-left py-2 px-3">Format</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Records</th>
                    <th className="text-right py-2 px-3">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(exportsList?.exports ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-gray-500">
                        No exports yet
                      </td>
                    </tr>
                  ) : (
                    exportsList!.exports.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {new Date(exp.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 px-3">{exp.format}</td>
                        <td className="py-2 px-3">{exp.status}</td>
                        <td className="py-2 px-3">{exp.recordCount ?? '—'}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            disabled={exp.status !== 'completed'}
                            onClick={() => downloadExportFile(exp)}
                            className="text-purple-600 hover:text-purple-800 disabled:text-gray-400 text-sm font-medium"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Can>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All action types</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={selectedResource}
              onChange={(e) => {
                setSelectedResource(e.target.value);
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent max-w-[220px]"
            >
              <option value="all">All resources</option>
              {resourceTypes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="1d">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Activity className="w-4 h-4" />
            <span>{filteredLogs.length} shown (client filter)</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {logsLoading ? (
          <div className="p-6 text-gray-600">Loading audit logs…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 py-3 px-2" />
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Action</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Resource</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Details</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">IP Address</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => {
                  const ActionIcon = getActionIcon(log.actionType);
                  const actionLabel = log.actionType.split('.').pop() || log.actionType;
                  const open = expandedId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(open ? null : log.id)}
                      >
                        <td className="py-3 px-2 text-gray-400">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-3">
                            <ActionIcon className="w-5 h-5 text-gray-500 shrink-0" />
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(actionLabel)}`}
                            >
                              {log.actionType}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-sm text-gray-900">
                            {log.userId ? `${log.userId.slice(0, 8)}…` : 'System'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">{log.resourceType}</div>
                          {log.resourceId && (
                            <div className="text-sm text-gray-500">ID: {log.resourceId}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-gray-900 max-w-xs truncate" title={detailsPreview(log)}>
                            {detailsPreview(log)}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-gray-900 font-mono text-sm">{log.ipAddress || '—'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-gray-900 text-sm">{formatDate(log.createdAt)}</div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-6 py-4 text-sm text-gray-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="font-medium text-gray-700 mb-1">Metadata</p>
                                <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto max-h-48">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="font-medium text-gray-700 mb-1">Old / new values</p>
                                <pre className="text-xs bg-white border border-gray-200 rounded p-3 overflow-x-auto max-h-48">
                                  {JSON.stringify({ oldValues: log.oldValues, newValues: log.newValues }, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {filteredLogs.length === 0 && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No audit logs found</h3>
                <p className="text-gray-500">Try adjusting your search criteria or date range.</p>
              </div>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Page {page} of {totalPages} ({total} total)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
