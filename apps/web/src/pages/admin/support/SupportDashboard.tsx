import React from 'react';
import { 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Users,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { PluginSlot } from '../../../lib/plugins';
import { useAuth } from '../../../hooks/useAuth';
import { trpc } from '../../../api/trpc';

export function SupportDashboard() {
  const { user } = useAuth();

  // Real tRPC calls for support data
  const { data: supportStats, isLoading: statsLoading } = trpc.support.getSupportStats.useQuery(undefined, {
    enabled: !!user,
  });
  
  const { data: recentTickets, isLoading: ticketsLoading } = trpc.support.getRecentTickets.useQuery({ 
    limit: 5 
  }, {
    enabled: !!user,
  });

  // Fallback data for loading states
  const stats = supportStats || {
    totalTickets: 0,
    openTickets: 0,
    inProgressTickets: 0,
    averageFirstResponseTime: 0,
    averageResolutionTime: 0,
    satisfactionScore: 0,
    ticketsByPriority: {},
    ticketsByCategory: {},
  };

  const tickets = recentTickets || [];

  const supportDashboardStats = [
    {
      name: 'Total Tickets',
      value: stats.totalTickets,
      change: '+8%',
      changeType: 'positive' as const,
      icon: MessageSquare,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      name: 'Open Tickets',
      value: stats.openTickets,
      change: '-12%',
      changeType: 'positive' as const,
      icon: AlertTriangle,
      color: 'from-yellow-500 to-orange-500'
    },
    {
      name: 'Resolved Today',
      value: stats.resolvedToday,
      change: '+5%',
      changeType: 'positive' as const,
      icon: CheckCircle,
      color: 'from-green-500 to-emerald-500'
    },
    {
      name: 'Avg Response Time',
      value: stats.averageFirstResponseTime,
      change: '-15%',
      changeType: 'positive' as const,
      icon: Clock,
      color: 'from-purple-500 to-pink-500'
    }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Support Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Overview of customer support activities and performance
          </p>
        </div>

        <PluginSlot 
          slotId="admin.support.dashboard.header.actions" 
          props={{ user }}
          className="flex items-center space-x-2"
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {supportDashboardStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                <div className="flex items-center mt-2">
                  <span className={`text-sm font-medium ${
                    stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">from last week</span>
                </div>
              </div>
              <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dashboard Widgets */}
      <PluginSlot 
        slotId="admin.support.dashboard.widgets" 
        props={{ user, stats }}
        className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tickets */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Tickets</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                View all
              </button>
            </div>
          </div>
          <div className="p-6">
            {tickets.length > 0 ? (
              <div className="space-y-4">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">#{ticket.ticketNumber}</p>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          ticket.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                          ticket.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                          ticket.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{ticket.subject}</p>
                      <div className="flex items-center mt-1 text-xs text-gray-500">
                        <span>{ticket.client.user.firstName} {ticket.client.user.lastName}</span>
                        <span className="mx-2">•</span>
                        <span>{formatDate(ticket.createdAt)}</span>
                        <span className="mx-2">•</span>
                        <span className={`px-1 py-0.5 rounded text-xs ${
                          ticket.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                          ticket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                    </div>
                  </div>
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

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <button className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
                <MessageSquare className="w-4 h-4 mr-2" />
                Create Ticket
              </button>
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <Users className="w-4 h-4 mr-2" />
                Manage Agents
              </button>
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <TrendingUp className="w-4 h-4 mr-2" />
                View Reports
              </button>
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <CheckCircle className="w-4 h-4 mr-2" />
                SLA Management
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Dashboard Sections */}
      <PluginSlot 
        slotId="admin.support.dashboard.bottom" 
        props={{ user, stats }}
        className="space-y-6"
      />
    </div>
  );
} 