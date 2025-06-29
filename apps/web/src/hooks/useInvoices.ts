import { trpc } from '../api/trpc';

export function useInvoices() {
  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = trpc.invoices.getAll.useQuery({ limit: 100, offset: 0 });

  const {
    data: statsData,
    isLoading: isStatsLoading,
    error: statsError
  } = trpc.invoices.getStats.useQuery();

  const generatePDFMutation = trpc.invoices.generatePDF.useQuery;

  return {
    invoices: invoicesData?.invoices || [],
    totalInvoices: invoicesData?.total || 0,
    stats: statsData,
    loading: isInvoicesLoading || isStatsLoading,
    error: invoicesError?.message || statsError?.message,
    refetch: refetchInvoices,
    generatePDF: generatePDFMutation
  };
}