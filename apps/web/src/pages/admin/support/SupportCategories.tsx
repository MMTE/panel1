import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, Loader2, Plus } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supportApi, type SupportCategoryRow } from '../../../api/supportApi';

export function SupportCategories() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['support', 'categories'],
    queryFn: () => supportApi.listCategories(),
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: () =>
      supportApi.createCategory({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      }),
    onSuccess: () => {
      setName('');
      setDescription('');
      setColor('#6366f1');
      queryClient.invalidateQueries({ queryKey: ['support', 'categories'] });
    },
  });

  const list: SupportCategoryRow[] = categories || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Support categories</h1>
        <p className="text-gray-600 mt-1">Organize tickets by category</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New category
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Billing"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-full max-w-[120px] border border-gray-300 rounded-lg cursor-pointer"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="mt-4 inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create category'}
        </button>
        {create.isError && (
          <p className="text-red-600 text-sm mt-2">{(create.error as Error).message}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            Categories ({list.length})
          </h2>
        </div>
        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-gray-600">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No categories yet.</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {list.map((c) => (
              <li key={c.id} className="px-6 py-4 flex items-center gap-4">
                <span
                  className="w-4 h-4 rounded-full shrink-0 border border-gray-200"
                  style={{ backgroundColor: c.color || '#6366f1' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  {c.description && <p className="text-sm text-gray-500 truncate">{c.description}</p>}
                </div>
                <span className="text-xs text-gray-400 font-mono">{c.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
