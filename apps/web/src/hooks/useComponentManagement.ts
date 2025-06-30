import { useState } from 'react';
import { trpc } from '../api/trpc';

export function useComponentManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Component mutations
  const restartMutation = trpc.components.restart.useMutation();
  const updateConfigMutation = trpc.components.updateConfiguration.useMutation();
  const scaleMutation = trpc.components.scale.useMutation();

  // Get component status query
  const getComponentStatus = (componentId: string) => {
    return trpc.components.getStatus.useQuery({ componentId }, {
      refetchInterval: 5000, // Refetch every 5 seconds
    });
  };

  const restartComponent = async (componentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await restartMutation.mutateAsync({ componentId });
      return result.success;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to restart component');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfiguration = async (componentId: string, configuration: Record<string, any>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await updateConfigMutation.mutateAsync({
        componentId,
        configuration,
      });
      return result.success;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update component configuration');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const scaleComponent = async (componentId: string, quantity: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await scaleMutation.mutateAsync({
        componentId,
        quantity,
      });
      return result.success;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to scale component');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    restartComponent,
    updateConfiguration,
    scaleComponent,
    getComponentStatus,
    isLoading,
    error,
    // Expose mutation states for UI feedback
    isRestarting: restartMutation.isLoading,
    isUpdating: updateConfigMutation.isLoading,
    isScaling: scaleMutation.isLoading,
    restartError: restartMutation.error,
    updateError: updateConfigMutation.error,
    scaleError: scaleMutation.error,
  };
} 