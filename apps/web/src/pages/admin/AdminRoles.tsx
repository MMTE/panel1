import React, { useState } from 'react';
import { Plus, Edit, Trash2, Users, Shield, X, Loader, AlertCircle, CheckCircle, Search, LayersIcon, FolderIcon } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { usePermissions, Can } from '../../hooks/usePermissions';
import { toast } from 'react-hot-toast';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Array<{
    id: string;
    name: string;
    description: string;
    resource: string;
    action: string;
  }>;
  _count: {
    users: number;
  };
}

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

interface RoleFormData {
  name: string;
  description: string;
  permissionIds: string[];
}

const RoleForm: React.FC<{
  initialData?: Role;
  onSave: (data: RoleFormData) => void;
  onCancel: () => void;
  isSaving?: boolean;
  error?: string;
}> = ({ initialData, onSave, onCancel, isSaving = false, error }) => {
  const { data: permissions } = trpc.permissions.getAllPermissions.useQuery();
  const { data: permissionGroups } = trpc.permissionGroups.list.useQuery();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'resource' | 'group'>('resource');
  
  const [formData, setFormData] = useState<RoleFormData>({
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

  const handleGroupToggle = (group: PermissionGroup) => {
    const groupPermissionIds = group.permissions.map(p => p.id);
    const allSelected = groupPermissionIds.every(id => formData.permissionIds.includes(id));
    
    setFormData(prev => ({
      ...prev,
      permissionIds: allSelected
        ? prev.permissionIds.filter(id => !groupPermissionIds.includes(id))
        : [...new Set([...prev.permissionIds, ...groupPermissionIds])]
    }));
  };

  const filteredPermissions = permissions?.filter(permission =>
    permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    permission.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    permission.resource.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredGroups = permissionGroups?.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.permissions.some(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
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
          <h3 className="text-lg font-medium text-gray-900">Role Information</h3>
          
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
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-500">
                {formData.permissionIds.length} selected
              </div>
              <div className="border rounded-lg p-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('resource')}
                  className={`px-3 py-1 rounded ${
                    viewMode === 'resource'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <LayersIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('group')}
                  className={`px-3 py-1 rounded ${
                    viewMode === 'group'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FolderIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder={`Search ${viewMode === 'group' ? 'permission groups' : 'permissions'}...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          {/* Permissions List */}
          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {viewMode === 'resource' ? (
              // Resource View
              Object.entries(groupedPermissions).map(([resource, resourcePermissions]) => (
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
              ))
            ) : (
              // Group View
              filteredGroups.map(group => (
                <div key={group.id} className="border-b border-gray-200 last:border-b-0">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900">
                        {group.name}
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleGroupToggle(group)}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        {group.permissions.every(p => formData.permissionIds.includes(p.id))
                          ? 'Deselect All'
                          : 'Select All'}
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {group.description}
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    {group.permissions.map(permission => (
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
              ))
            )}
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
              'Save Role'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const AdminRoles: React.FC = () => {
  const { can } = usePermissions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch roles
  const { 
    data: roles, 
    isLoading, 
    error,
    refetch 
  } = trpc.permissions.listRoles.useQuery({
    include: { permissions: true, _count: { select: { users: true } } }
  });

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Create role mutation
  const createRole = trpc.permissions.createRole.useMutation({
    onSuccess: () => {
      utils.permissions.listRoles.invalidate();
      setShowCreateModal(false);
      setEditingRole(null);
      toast.success('Role created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create role: ${error.message}`);
    }
  });

  // Update role mutation
  const updateRole = trpc.permissions.updateRole.useMutation({
    onSuccess: () => {
      utils.permissions.listRoles.invalidate();
      setShowCreateModal(false);
      setEditingRole(null);
      toast.success('Role updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update role: ${error.message}`);
    }
  });

  // Delete role mutation
  const deleteRole = trpc.permissions.deleteRole.useMutation({
    onSuccess: () => {
      utils.permissions.listRoles.invalidate();
      toast.success('Role deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete role: ${error.message}`);
    }
  });

  const handleSaveRole = async (data: RoleFormData) => {
    try {
      if (editingRole) {
        await updateRole.mutateAsync({
          id: editingRole.id,
          ...data
        });
      } else {
        await createRole.mutateAsync(data);
      }
    } catch (error) {
      // Error is handled by the mutation callbacks
      console.error('Failed to save role:', error);
    }
  };

  const handleDeleteRole = (roleId: string) => {
    if (window.confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      deleteRole.mutate({ id: roleId });
    }
  };

  const filteredRoles = roles?.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!can('user.manage_roles')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">You don't have permission to manage roles.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-gray-600">Loading roles...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Roles</h3>
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
          <h1 className="text-2xl font-bold text-gray-900">Role Management</h1>
          <p className="text-gray-600 mt-1">
            Manage user roles and permissions
          </p>
        </div>
        <Can permission="user.manage_roles">
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Role
          </button>
        </Can>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="Search roles..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredRoles.map(role => (
          <div key={role.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{role.name}</h3>
                  <p className="text-sm text-gray-600">{role.description}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Users</p>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium">{role._count.users}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Permissions</p>
                <div className="flex flex-wrap gap-1">
                  {role.permissions.slice(0, 3).map(permission => (
                    <span key={permission.id} className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                      {permission.name}
                    </span>
                  ))}
                  {role.permissions.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                      +{role.permissions.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                {role.permissions.length} permissions
              </div>
              <div className="flex items-center gap-2">
                <Can permission="user.manage_roles">
                  <button 
                    onClick={() => {
                      setEditingRole(role);
                      setShowCreateModal(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteRole(role.id)}
                    disabled={deleteRole.isLoading}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Can>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredRoles.length === 0 && (
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No roles found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm ? `No roles matching "${searchTerm}"` : "You haven't created any roles yet."}
          </p>
          <Can permission="user.manage_roles">
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Your First Role
            </button>
          </Can>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingRole ? 'Edit Role' : 'Create New Role'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingRole(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <RoleForm
                initialData={editingRole}
                onSave={handleSaveRole}
                onCancel={() => {
                  setShowCreateModal(false);
                  setEditingRole(null);
                }}
                isSaving={createRole.isLoading || updateRole.isLoading}
                error={createRole.error?.message || updateRole.error?.message}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRoles;
