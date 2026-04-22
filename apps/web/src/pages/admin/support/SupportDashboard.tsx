import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ListTodo,
  FolderTree,
  ShieldAlert,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { supportApi } from '../../../api/supportApi';

export function SupportDashboard() {
  const { user } = useAuth();

  const { data: supportStats, isLoading: statsLoading } = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: () => supportApi.getStats(),
    enabled: !!user,
  });

  const { data: sla, isLoading: slaLoading } = useQuery({
    queryKey: ['support', 'sla', 'metrics'],
    queryFn: () => supportApi.getSlaMetrics(),
    enabled: !!user,
  });

  const { data: ticketsPage, isLoading: ticketsLoading } = useQuery({
    queryKey: ['support', 'tickets', 'recent'],
    queryFn: () => supportApi.listTickets({ limit: 5, offset: 0 }),
    enabled: !!user,
  });

  const stats = supportStats || {
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    averageFirstResponseTime: 0,
    averageResolutionTime: 0,
    satisfactionScore: 0,
    ticketsByPriority: {} as Record<string, number>,
    ticketsByCategory: {} as Record<string, number>,
  };

  const tickets = ticketsPage?.tickets || [];

  const supportDashboardStats = [
    {
      name: 'Total tickets',
      value: stats.totalTickets,
      icon: MessageSquare,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      name: 'Open',
      value: stats.openTickets,
      icon: AlertTriangle,
      color: 'from-yellow-500 to-orange-500',
    },
    {
      name: 'In progress',
      value: stats.inProgressTickets,
      icon: CheckCircle,
      color: 'from-green-500 to-emerald-500',
    },
    {
      name: 'Avg first response (min)',
      value: Number.isFinite(stats.averageFirstResponseTime)
        ? Math.round(stats.averageFirstResponseTime)
        : 0,
      icon: Clock,
      color: 'from-purple-500 to-pink-500',
    },
  ];

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (statsLoading || ticketsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading support dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Support Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of tickets and SLA health</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/support/tickets"
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            <ListTodo className="w-4 h-4 mr-2" />
            All tickets
          </Link>
          <Link
            to="/admin/support/categories"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <FolderTree className="w-4 h-4 mr-2" />
            Categories
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {supportDashboardStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
              </div>
              <div
                className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}
              >
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {!slaLoading && sla && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            SLA snapshot
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <p className="text-gray-500">First response SLA</p>
              <p className="text-xl font-semibold text-gray-900">
                {(sla.firstResponseSlaRate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-gray-500">Resolution SLA</p>
              <p className="text-xl font-semibold text-gray-900">
                {(sla.resolutionSlaRate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-gray-500">Breached</p>
              <p className="text-xl font-semibold text-red-600">{sla.breachedTickets}</p>
            </div>
            <div>
              <p className="text-gray-500">At risk</p>
              <p className="text-xl font-semibold text-amber-600">{sla.atRiskTickets}</p>
            </div>
            <div>
              <p className="text-gray-500">Avg first response</p>
              <p className="text-xl font-semibold text-gray-900">
                {Math.round(sla.averageFirstResponseTime)}m
              </p>
            </div>
            <div>
              <p className="text-gray-500">Avg resolution</p>
              <p className="text-xl font-semibold text-gray-900">
                {Math.round(sla.averageResolutionTime)}m
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent tickets</h2>
            <Link to="/admin/support/tickets" className="text-sm text-purple-600 hover:text-purple-800">
              View all
            </Link>
          </div>
          <div className="p-6">
            {tickets.length > 0 ? (
              <div className="space-y-4">
                {tickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    to={`/admin/support/tickets/${ticket.id}`}
                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors block"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">#{ticket.ticketNumber}</p>
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            ticket.status === 'OPEN'
                              ? 'bg-blue-100 text-blue-800'
                              : ticket.status === 'IN_PROGRESS'
                                ? 'bg-yellow-100 text-yellow-800'
                                : ticket.status === 'RESOLVED'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {(ticket.status || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{ticket.subject}</p>
                      <div className="flex items-center mt-1 text-xs text-gray-500">
                        <span>{ticket.clientId ? `Client ${ticket.clientId.slice(0, 8)}…` : 'No client'}</span>
                        <span className="mx-2">•</span>
                        <span>{formatDate(ticket.createdAt)}</span>
                        {ticket.priority && (
                          <>
                            <span className="mx-2">•</span>
                            <span
                              className={`px-1 py-0.5 rounded text-xs ${
                                ticket.priority === 'HIGH' || ticket.priority === 'URGENT'
                                  ? 'bg-red-100 text-red-700'
                                  : ticket.priority === 'MEDIUM'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {ticket.priority}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No recent tickets</h3>
                <p className="text-gray-600">New support tickets will appear here.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By priority</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(stats.ticketsByPriority).length === 0 ? (
              <li className="text-gray-500">No data</li>
            ) : (
              Object.entries(stats.ticketsByPriority).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))
            )}
          </ul>
          <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-2">By category</h2>
          <ul className="space-y-2 text-sm">
            {Object.entries(stats.ticketsByCategory).length === 0 ? (
              <li className="text-gray-500">No data</li>
            ) : (
              Object.entries(stats.ticketsByCategory).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="truncate mr-2">{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
