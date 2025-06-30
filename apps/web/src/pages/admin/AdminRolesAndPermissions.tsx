import React, { useState, useEffect } from 'react';
import { trpc } from '../../api/trpc';
import { Role, ResourceType, PermissionAction } from '../../lib/auth/types';
import { usePermissions } from '../../hooks/usePermissions';
import { Loader2, Plus, Trash2, Save } from 'lucide-react';

interface Permission {
  id: string;
  name: string;
  resource: ResourceType;
  action: PermissionAction;
  description: string;
}

interface RolePermission {
  roleId: string;
  permissionId: string;
}

const AdminRolesAndPermissions: React.FC = () => {
  const { hasPermission } = usePermissions();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterResource, setFilterResource] = useState<ResourceType | ''>('');

  // tRPC queries and mutations
  const { data: roles, isLoading: rolesLoading } = trpc.auth.getRoles.useQuery();
  const { data: permissions, isLoading: permissionsLoading } = trpc.auth.getPermissions.useQuery();
  const { data: rolePermissions, isLoading: rolePermissionsLoading } = trpc.auth.getRolePermissions.useQuery(
    { roleId: selectedRole || '' },
    { enabled: !!selectedRole }
  );

  const updateRolePermissions = trpc.auth.updateRolePermissions.useMutation();
  const utils = trpc.useContext();

  useEffect(() => {
    if (rolePermissions) {
      setSelectedPermissions(new Set(rolePermissions.map(p => p.permissionId)));
    }
  }, [rolePermissions]);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setEditMode(false);
  };

  const handlePermissionToggle = (permissionId: string) => {
    const newSelected = new Set(selectedPermissions);
    if (newSelected.has(permissionId)) {
      newSelected.delete(permissionId);
    } else {
      newSelected.add(permissionId);
    }
    setSelectedPermissions(newSelected);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    try {
      await updateRolePermissions.mutateAsync({
        roleId: selectedRole,
        permissions: Array.from(selectedPermissions)
      });

      await utils.auth.getRolePermissions.invalidate({ roleId: selectedRole });
      setEditMode(false);
    } catch (error) {
      console.error('Failed to update role permissions:', error);
    }
  };

  const filteredPermissions = permissions?.filter(permission => {
    const matchesSearch = searchTerm === '' || 
      permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permission.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesResource = !filterResource || permission.resource === filterResource;
    
    return matchesSearch && matchesResource;
  });

  if (rolesLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Roles & Permissions</h1>
        {selectedRole && editMode && (
          <button
            onClick={handleSavePermissions}
            disabled={updateRolePermissions.isLoading}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {updateRolePermissions.isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Roles List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Roles</h2>
          <div className="space-y-2">
            {roles?.map(role => (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role.id as Role)}
                className={`w-full text-left px-4 py-2 rounded-md transition-colors ${
                  selectedRole === role.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-gray-100'
                }`}
              >
                {role.name}
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Management */}
        <div className="md:col-span-3 bg-white rounded-lg shadow p-6">
          {selectedRole ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">
                  Permissions for {roles?.find(r => r.id === selectedRole)?.name}
                </h2>
                <button
                  onClick={() => setEditMode(!editMode)}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  {editMode ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Search permissions..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-md"
                />
                <select
                  value={filterResource}
                  onChange={e => setFilterResource(e.target.value as ResourceType | '')}
                  className="px-4 py-2 border rounded-md"
                >
                  <option value="">All Resources</option>
                  {Object.values(ResourceType).map(resource => (
                    <option key={resource} value={resource}>
                      {resource}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permissions List */}
              <div className="space-y-2">
                {filteredPermissions?.map(permission => (
                  <div
                    key={permission.id}
                    className={`p-4 rounded-md border ${
                      editMode ? 'hover:bg-gray-50' : ''
                    }`}
                  >
                    <div className="flex items-center">
                      {editMode && (
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(permission.id)}
                          onChange={() => handlePermissionToggle(permission.id)}
                          className="mr-4"
                        />
                      )}
                      <div>
                        <h3 className="font-medium">{permission.name}</h3>
                        <p className="text-sm text-gray-600">
                          {permission.description}
                        </p>
                        <div className="flex gap-2 mt-1">
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            {permission.resource}
                          </span>
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                            {permission.action}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Select a role to manage its permissions
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminRolesAndPermissions; 