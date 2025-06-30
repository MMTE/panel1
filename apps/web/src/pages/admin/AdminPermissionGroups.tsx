import React, { useState } from 'react';
import { trpc } from '../../api/trpc';
import { usePermissions } from '../../hooks/usePermissions';
import { Plus, Edit, Trash2, Shield, X, Loader2, AlertCircle, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

interface GroupFormData {
  name: string;
  description: string;
  permissionIds: string[];
}

const GroupForm: React.FC<{
  initialData?: PermissionGroup;
  onSave: (data: GroupFormData) => void;
  onCancel: () => void;
  isSaving?: boolean;
  error?: string;
}> = ({ initialData, onSave, onCancel, isSaving = false, error }) => {
  const { data: permissions } = trpc.permissions.getAllPermissions.useQuery();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState<GroupFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    permissionIds: initialData?.permissions.map(p => p.id) || []
  });

  const [formErrors, setFormErrors] = useState<{
    name?: string;
    description?: string;
    permissions?: string;
  }>({});

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    } else if (formData.name.length < 3) {
      errors.name = 'Name must be at least 3 characters';
    }

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }

    if (formData.permissionIds.length === 0) {
      errors.permissions = 'At least one permission must be selected';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(permissionId)
        ? prev.permissionIds.filter(id => id !== permissionId)
        : [...prev.permissionIds, permissionId]
    }));
  };

  const filteredPermissions = permissions?.filter(permission =>
    permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    permission.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    permission.resource.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Group permissions by resource
  const groupedPermissions = filteredPermissions.reduce((acc, permission) => {
    if (!acc[permission.resource]) {
      acc[permission.resource] = [];
    }
    acc[permission.resource].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Group Information</h3>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`mt-1 block w-full rounded-md border ${
                  formErrors.name ? 'border-red-300' : 'border-gray-300'
                } px-3 py-2`}
                required
                minLength={3}
              />
              {formErrors.name && (
                <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className={`mt-1 block w-full rounded-md border ${
                  formErrors.description ? 'border-red-300' : 'border-gray-300'
                } px-3 py-2`}
                required
              />
              {formErrors.description && (
                <p className="mt-1 text-sm text-red-600">{formErrors.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
            <div className="text-sm text-gray-500">
              {formData.permissionIds.length} selected
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search permissions..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Permissions List */}
          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {Object.entries(groupedPermissions).map(([resource, resourcePermissions]) => (
              <div key={resource} className="border-b border-gray-200 last:border-b-0">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 capitalize">
                    {resource} ({resourcePermissions.length})
                  </h4>
                </div>
                <div className="p-4 space-y-3">
                  {resourcePermissions.map(permission => (
                    <div key={permission.id} className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={formData.permissionIds.includes(permission.id)}
                        onChange={() => handlePermissionToggle(permission.id)}
                        className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {permission.name}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            {permission.action}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {permission.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {formErrors.permissions && (
          <p className="text-sm text-red-600">{formErrors.permissions}</p>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save Group'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const AdminPermissionGroups: React.FC = () => {
  const { can } = usePermissions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PermissionGroup | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch groups
  const { 
    data: groups, 
    isLoading, 
    error,
    refetch 
  } = trpc.permissionGroups.list.useQuery();

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Create group mutation
  const createGroup = trpc.permissionGroups.create.useMutation({
    onSuccess: () => {
      utils.permissionGroups.list.invalidate();
      setShowCreateModal(false);
      setEditingGroup(null);
      toast.success('Permission group created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create group: ${error.message}`);
    }
  });

  // Update group mutation
  const updateGroup = trpc.permissionGroups.update.useMutation({
    onSuccess: () => {
      utils.permissionGroups.list.invalidate();
      setShowCreateModal(false);
      setEditingGroup(null);
      toast.success('Permission group updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update group: ${error.message}`);
    }
  });

  // Delete group mutation
  const deleteGroup = trpc.permissionGroups.delete.useMutation({
    onSuccess: () => {
      utils.permissionGroups.list.invalidate();
      toast.success('Permission group deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete group: ${error.message}`);
    }
  });

  const handleSaveGroup = async (data: GroupFormData) => {
    try {
      if (editingGroup) {
        await updateGroup.mutateAsync({
          id: editingGroup.id,
          ...data
        });
      } else {
        await createGroup.mutateAsync(data);
      }
    } catch (error) {
      // Error is handled by the mutation callbacks
      console.error('Failed to save group:', error);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    if (window.confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      deleteGroup.mutate({ id: groupId });
    }
  };

  const filteredGroups = groups?.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!can('admin.roles.manage_permissions')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">You don't have permission to manage permission groups.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-gray-600">Loading permission groups...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Groups</h3>
          <p className="text-gray-600 mb-4">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permission Groups</h1>
          <p className="text-gray-600 mt-1">
            Manage and organize permissions into logical groups
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Group
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search permission groups..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredGroups.map(group => (
          <div key={group.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{group.name}</h3>
                  <p className="text-sm text-gray-600">{group.description}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Permissions</p>
                <div className="flex flex-wrap gap-1">
                  {group.permissions.slice(0, 3).map(permission => (
                    <span key={permission.id} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                      {permission.name}
                    </span>
                  ))}
                  {group.permissions.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                      +{group.permissions.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                {group.permissions.length} permissions
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setEditingGroup(group);
                    setShowCreateModal(true);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleDeleteGroup(group.id)}
                  disabled={deleteGroup.isLoading}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredGroups.length === 0 && (
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No permission groups found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm ? `No groups matching "${searchTerm}"` : "You haven't created any permission groups yet."}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Group
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingGroup ? 'Edit Permission Group' : 'Create Permission Group'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingGroup(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <GroupForm
                initialData={editingGroup}
                onSave={handleSaveGroup}
                onCancel={() => {
                  setShowCreateModal(false);
                  setEditingGroup(null);
                }}
                isSaving={createGroup.isLoading || updateGroup.isLoading}
                error={createGroup.error?.message || updateGroup.error?.message}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPermissionGroups; 