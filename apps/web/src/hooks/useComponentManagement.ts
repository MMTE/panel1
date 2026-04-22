import { useMutation, useQuery } from '@tanstack/react-query';
import { catalogApi } from '../api/catalogApi';

export function useComponentManagement() {
  const restartMutation = useMutation({
    mutationFn: (componentId: string) => catalogApi.restartInstance(componentId),
  });
  const updateConfigMutation = useMutation({
    mutationFn: ({
      componentId,
      configuration,
    }: {
      componentId: string;
      configuration: Record<string, unknown>;
    }) => catalogApi.updateInstanceConfiguration(componentId, configuration),
  });
  const scaleMutation = useMutation({
    mutationFn: ({ componentId, quantity }: { componentId: string; quantity: number }) =>
      catalogApi.scaleInstance(componentId, quantity),
  });

  const getComponentStatus = (componentId: string) =>
    useQuery({
      queryKey: ['catalog', 'instance-status', componentId],
      queryFn: () => catalogApi.getInstanceStatus(componentId),
      refetchInterval: 5000,
      enabled: !!componentId,
    });

  const restartComponent = async (componentId: string) => {
    const result = await restartMutation.mutateAsync(componentId);
    return result.success;
  };

  const updateConfiguration = async (componentId: string, configuration: Record<string, unknown>) => {
    const result = await updateConfigMutation.mutateAsync({ componentId, configuration });
    return result.success;
  };

  const scaleComponent = async (componentId: string, quantity: number) => {
    const result = await scaleMutation.mutateAsync({ componentId, quantity });
    return result.success;
  };

  return {
    restartComponent,
    updateConfiguration,
    scaleComponent,
    getComponentStatus,
    isLoading:
      restartMutation.isPending || updateConfigMutation.isPending || scaleMutation.isPending,
    error:
      restartMutation.error?.message ||
      updateConfigMutation.error?.message ||
      scaleMutation.error?.message ||
      null,
    isRestarting: restartMutation.isPending,
    isUpdating: updateConfigMutation.isPending,
    isScaling: scaleMutation.isPending,
    restartError: restartMutation.error,
    updateError: updateConfigMutation.error,
    scaleError: scaleMutation.error,
  };
}
