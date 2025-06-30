import React from 'react';

interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  componentKey: string;
  metadata: {
    requiredConfigFields?: string[];
    optionalConfigFields?: string[];
    supportedPricingModels?: string[];
    usageTrackingSupported?: boolean;
    provisioningRequired?: boolean;
    provisioningProvider?: string;
  };
}

interface DynamicConfigFormProps {
  componentDefinition: ComponentDefinition;
  configuration: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export const DynamicConfigForm: React.FC<DynamicConfigFormProps> = ({
  componentDefinition,
  configuration,
  onChange
}) => {
  const { metadata } = componentDefinition;
  const requiredFields = metadata.requiredConfigFields || [];
  const optionalFields = metadata.optionalConfigFields || [];

  const updateField = (fieldName: string, value: any) => {
    onChange({
      ...configuration,
      [fieldName]: value
    });
  };

  const getFieldType = (fieldName: string): string => {
    const typeMap: Record<string, string> = {
      'domain': 'string',
      'domainName': 'string',
      'certificateType': 'select',
      'validityPeriod': 'number',
      'autoRenew': 'boolean',
      'privacyProtection': 'boolean',
      'diskSpace': 'number',
      'bandwidth': 'number',
      'emailAccounts': 'number',
      'databases': 'number',
      'subdomains': 'number',
      'cpanelUsername': 'string',
      'ftpAccounts': 'number',
      'cronJobs': 'number',
      'backupEnabled': 'boolean',
      'sslEnabled': 'boolean',
      'phpVersion': 'select',
      'mysqlVersion': 'select',
      'registrationPeriod': 'number',
      'nameservers': 'array',
      'dnsRecords': 'array',
    };
    
    return typeMap[fieldName] || 'string';
  };

  const formatFieldName = (fieldName: string): string => {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
  };

  const getFieldOptions = (fieldName: string): Array<{value: string, label: string}> => {
    const optionsMap: Record<string, Array<{value: string, label: string}>> = {
      'certificateType': [
        { value: 'domain_validated', label: 'Domain Validated' },
        { value: 'organization_validated', label: 'Organization Validated' },
        { value: 'extended_validation', label: 'Extended Validation' }
      ],
      'phpVersion': [
        { value: '7.4', label: 'PHP 7.4' },
        { value: '8.0', label: 'PHP 8.0' },
        { value: '8.1', label: 'PHP 8.1' },
        { value: '8.2', label: 'PHP 8.2' }
      ],
      'mysqlVersion': [
        { value: '5.7', label: 'MySQL 5.7' },
        { value: '8.0', label: 'MySQL 8.0' }
      ],
    };
    
    return optionsMap[fieldName] || [];
  };

  const getFieldPlaceholder = (fieldName: string): string => {
    const placeholderMap: Record<string, string> = {
      'domain': 'example.com',
      'domainName': 'example.com',
      'diskSpace': '10240 (MB)',
      'bandwidth': '100 (GB)',
      'emailAccounts': '10',
      'databases': '5',
      'subdomains': '10',
      'cpanelUsername': 'user123',
      'validityPeriod': '365 (days)',
      'registrationPeriod': '1 (years)',
    };
    
    return placeholderMap[fieldName] || '';
  };

  const renderField = (fieldName: string, isRequired: boolean) => {
    const fieldType = getFieldType(fieldName);
    const fieldValue = configuration[fieldName] || '';
    const placeholder = getFieldPlaceholder(fieldName);

    switch (fieldType) {
      case 'string':
        return (
          <div key={fieldName} className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(fieldName)}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="text"
              value={fieldValue}
              onChange={(e) => updateField(fieldName, e.target.value)}
              placeholder={placeholder}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              required={isRequired}
            />
          </div>
        );
        
      case 'number':
        return (
          <div key={fieldName} className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(fieldName)}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="number"
              value={fieldValue}
              onChange={(e) => updateField(fieldName, parseFloat(e.target.value) || 0)}
              placeholder={placeholder}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              required={isRequired}
              min="0"
            />
          </div>
        );
        
      case 'boolean':
        return (
          <div key={fieldName} className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={fieldValue}
                onChange={(e) => updateField(fieldName, e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">
                {formatFieldName(fieldName)}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
          </div>
        );
        
      case 'select':
        const options = getFieldOptions(fieldName);
        return (
          <div key={fieldName} className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(fieldName)}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              value={fieldValue}
              onChange={(e) => updateField(fieldName, e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              required={isRequired}
            >
              <option value="">Select {formatFieldName(fieldName)}</option>
              {options.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'array':
        const arrayValue = Array.isArray(fieldValue) ? fieldValue : [];
        return (
          <div key={fieldName} className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formatFieldName(fieldName)}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <div className="space-y-2">
              {arrayValue.map((item: string, index: number) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => {
                      const newArray = [...arrayValue];
                      newArray[index] = e.target.value;
                      updateField(fieldName, newArray);
                    }}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                    placeholder={`${formatFieldName(fieldName)} ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newArray = arrayValue.filter((_, i) => i !== index);
                      updateField(fieldName, newArray);
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateField(fieldName, [...arrayValue, ''])}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                + Add {formatFieldName(fieldName)}
              </button>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  if (requiredFields.length === 0 && optionalFields.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No configuration fields defined for this component.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-lg font-medium text-gray-900 mb-2">
          {componentDefinition.name} Configuration
        </h4>
        <p className="text-sm text-gray-600">{componentDefinition.description}</p>
      </div>
      
      {requiredFields.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
            Required Configuration
          </h5>
          <div className="space-y-4">
            {requiredFields.map(field => renderField(field, true))}
          </div>
        </div>
      )}
      
      {optionalFields.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h5 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
            <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
            Optional Configuration
          </h5>
          <div className="space-y-4">
            {optionalFields.map(field => renderField(field, false))}
          </div>
        </div>
      )}
    </div>
  );
}; 