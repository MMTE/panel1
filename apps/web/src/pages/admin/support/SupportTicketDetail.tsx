import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MessageSquare, Send, UserPlus } from 'lucide-react';
import { supportApi } from '../../../api/supportApi';

const STATUS_OPTIONS = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_STAFF',
  'RESOLVED',
  'CLOSED',
] as const;

export function SupportTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: () => supportApi.getTicket(ticketId!, true),
    enabled: !!ticketId,
  });

  const addMessage = useMutation({
    mutationFn: () =>
      supportApi.addMessage(ticketId!, {
        content: reply,
        isInternal: internalNote,
        messageType: internalNote ? 'INTERNAL_NOTE' : 'STAFF_REPLY',
      }),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => supportApi.updateTicketStatus(ticketId!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });

  const assign = useMutation({
    mutationFn: () => supportApi.assignTicket(ticketId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });

  if (!ticketId) {
    return (
      <div className="p-6">
        <p className="text-red-600">Missing ticket id</p>
        <button type="button" className="text-purple-600 mt-2" onClick={() => navigate('/admin/support/tickets')}>
          Back to tickets
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading ticket…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-red-600">{(error as Error)?.message || 'Ticket not found'}</p>
        <Link to="/admin/support/tickets" className="text-purple-600 mt-2 inline-block">
          Back to tickets
        </Link>
      </div>
    );
  }

  const { ticket, messages } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/admin/support/tickets')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Tickets
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-gray-900">
            #{ticket.ticketNumber}{' '}
            <span className="font-normal text-gray-600">{ticket.subject}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Priority: {ticket.priority || '—'} · Updated{' '}
            {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Conversation
            </h2>
            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-sm">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-4 border ${
                      m.isInternal ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>
                        {m.authorName || m.authorEmail || m.authorId?.slice(0, 8) || 'Staff'}{' '}
                        {m.isInternal && (
                          <span className="text-amber-800 font-medium">(internal)</span>
                        )}
                      </span>
                      <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}</span>
                    </div>
                    <div className="text-gray-900 whitespace-pre-wrap text-sm">{m.content}</div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={internalNote}
                    onChange={(e) => setInternalNote(e.target.checked)}
                    className="mr-2 rounded border-gray-300"
                  />
                  Internal note
                </label>
                <button
                  type="button"
                  disabled={!reply.trim() || addMessage.isPending}
                  onClick={() => addMessage.mutate()}
                  className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {addMessage.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Status</h3>
            <select
              value={ticket.status || 'OPEN'}
              onChange={(e) => updateStatus.mutate(e.target.value)}
              disabled={updateStatus.isPending}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Assignment</h3>
            <p className="text-sm text-gray-600 mb-3 break-all">
              {ticket.assignedToId ? `Assigned: ${ticket.assignedToId}` : 'Unassigned'}
            </p>
            <button
              type="button"
              onClick={() => assign.mutate()}
              disabled={assign.isPending}
              className="inline-flex items-center w-full justify-center px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              {assign.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Auto-assign
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600">
            <p>
              <span className="font-medium text-gray-900">Client:</span> {ticket.clientId || '—'}
            </p>
            <p className="mt-2">
              <span className="font-medium text-gray-900">Category:</span> {ticket.categoryId || '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
